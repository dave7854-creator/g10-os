import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SendRequestBody {
  conversation_id: string;
  body: string;
  sent_by?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { conversation_id, body, sent_by } = await req.json() as SendRequestBody;

    if (!conversation_id || !body) {
      return new Response(JSON.stringify({ error: "conversation_id and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation to get phone number
    const { data: conv, error: convErr } = await supabase
      .from("message_conversations")
      .select("contact_phone, module, contact_name")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conv.contact_phone) {
      return new Response(JSON.stringify({ error: "No phone number for this conversation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch messaging config
    const { data: cfg } = await supabase
      .from("messaging_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (!cfg || !cfg.is_active || !cfg.api_key) {
      // No provider configured — save message as outgoing but mark delivery as "pending"
      const { data: msg } = await supabase
        .from("message_messages")
        .insert({
          conversation_id,
          direction: "outgoing",
          body,
          is_read: true,
          delivery_status: "pending",
          sent_by: sent_by ?? null,
        })
        .select()
        .maybeSingle();

      await supabase
        .from("message_conversations")
        .update({
          last_message_preview: body.slice(0, 100),
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      return new Response(JSON.stringify({
        success: true,
        message: "Message saved (provider not configured — message will send once connected)",
        message_id: msg?.id,
        delivered: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via provider
    let providerMessageId: string | null = null;
    let deliveryStatus = "sent";
    let sendError: string | null = null;

    try {
      if (cfg.provider === "telnyx") {
        const resp = await fetch("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${cfg.api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: cfg.phone_number,
            to: conv.contact_phone,
            text: body,
          }),
        });
        if (!resp.ok) {
          const errBody = await resp.text();
          throw new Error(`Telnyx error ${resp.status}: ${errBody}`);
        }
        const data = await resp.json();
        providerMessageId = data?.data?.id ?? null;
      } else if (cfg.provider === "twilio") {
        const auth = btoa(`${cfg.api_key}:${cfg.api_secret ?? ""}`);
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${cfg.api_key}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              From: cfg.phone_number ?? "",
              To: conv.contact_phone,
              Body: body,
            }),
          }
        );
        if (!resp.ok) {
          const errBody = await resp.text();
          throw new Error(`Twilio error ${resp.status}: ${errBody}`);
        }
        const data = await resp.json();
        providerMessageId = data?.sid ?? null;
      }
    } catch (err) {
      deliveryStatus = "failed";
      sendError = (err as Error).message;
    }

    const { data: msg } = await supabase
      .from("message_messages")
      .insert({
        conversation_id,
        direction: "outgoing",
        body,
        is_read: true,
        delivery_status: deliveryStatus,
        provider_message_id: providerMessageId,
        sent_by: sent_by ?? null,
      })
      .select()
      .maybeSingle();

    await supabase
      .from("message_conversations")
      .update({
        last_message_preview: body.slice(0, 100),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    if (sendError) {
      return new Response(JSON.stringify({
        success: false,
        error: sendError,
        message_id: msg?.id,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: msg?.id,
      provider_message_id: providerMessageId,
      delivered: true,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
