import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Extract phone and text from Telnyx or Twilio webhook formats
    let fromPhone = "";
    let text = "";
    let providerMessageId: string | null = null;

    // Telnyx format: { data: { payload: { from: { phone_number }, text, id } } }
    if (body?.data?.payload) {
      const p = body.data.payload;
      fromPhone = p.from?.phone_number ?? p.from ?? "";
      text = p.text ?? "";
      providerMessageId = p.id ?? null;
    }
    // Twilio format: { From, Body, MessageSid }
    else if (body?.From) {
      fromPhone = body.From;
      text = body.Body ?? "";
      providerMessageId = body.MessageSid ?? null;
    }

    if (!fromPhone || !text) {
      return new Response(JSON.stringify({ error: "Could not extract phone/text from webhook" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize phone to digits for matching
    const digits = fromPhone.replace(/\D/g, "");
    const normalizedPhone = digits.length === 11 && digits.startsWith("1") ? "+" + digits : "+" + digits.padStart(11, "1");

    // Try to find existing conversation by phone across all modules
    const { data: existing } = await supabase
      .from("message_conversations")
      .select("*")
      .eq("contact_phone", fromPhone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    let isUnassigned = false;

    if (existing) {
      conversationId = existing.id;
    } else {
      // No existing conversation — create as unassigned
      isUnassigned = true;
      const { data: newConv } = await supabase
        .from("message_conversations")
        .insert({
          module: "shop",
          contact_name: "Unknown",
          contact_phone: fromPhone,
          is_unassigned: true,
          last_message_preview: text.slice(0, 100),
          last_message_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (!newConv) {
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = newConv.id;
    }

    // Insert the incoming message
    await supabase.from("message_messages").insert({
      conversation_id: conversationId,
      direction: "incoming",
      body: text,
      is_read: false,
      delivery_status: "delivered",
      provider_message_id: providerMessageId,
    });

    // Update conversation: increment unread, update preview
    if (existing) {
      await supabase
        .from("message_conversations")
        .update({
          unread_count: (existing.unread_count ?? 0) + 1,
          last_message_preview: text.slice(0, 100),
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      await supabase
        .from("message_conversations")
        .update({
          unread_count: 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }

    return new Response(JSON.stringify({ success: true, conversation_id: conversationId, unassigned: isUnassigned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
