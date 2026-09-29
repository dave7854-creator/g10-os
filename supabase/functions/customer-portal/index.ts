import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Manager-Token",
};

if (import.meta.main) {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/customer-portal\/?/, "");

      // ===== LINK ACCOUNT (called after Supabase Auth OTP login) =====
      // This links the authenticated user to their shop_customers record
      if (path === "link-account" && req.method === "POST") {
        const authHeader = req.headers.get("Authorization") || "";
        const token = authHeader.replace("Bearer ", "");
        if (!token) return json({ error: "Authentication required." }, 401);

        const userClient = createUserClient(token);
        const { data: { user }, error: userError } = await userClient.auth.getUser();

        if (userError || !user) {
          return json({ error: "Authentication required." }, 401);
        }

        const serviceClient = createServiceClient();

        // Check if already linked
        const { data: existingLink } = await serviceClient
          .from("customer_auth_links")
          .select("customer_id, portal_status, setup_complete")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existingLink) {
          // Check if portal is disabled
          if (existingLink.portal_status === "disabled") {
            return json({ error: "Your portal access has been disabled. Please call us if you need help." }, 403);
          }
          // Update last_login_at
          await serviceClient
            .from("customer_auth_links")
            .update({ last_login_at: new Date().toISOString() })
            .eq("user_id", user.id);
          // Return customer info
          const { data: customer } = await serviceClient
            .from("shop_customers")
            .select("id, first_name, last_name, email, phone")
            .eq("id", existingLink.customer_id)
            .maybeSingle();

          return json({ linked: true, customer_id: existingLink.customer_id, customer, setup_complete: existingLink.setup_complete });
        }

        // Find customer by email
        const email = user.email;
        if (!email) {
          return json({ error: "No email associated with your account." }, 400);
        }

        const { data: customer } = await serviceClient
          .from("shop_customers")
          .select("id, first_name, last_name, email, phone")
          .ilike("email", email)
          .maybeSingle();

        if (!customer) {
          return json({
            linked: false,
            needs_setup: true,
            error: "No customer record found for this email.",
          }, 404);
        }

        // Check if this customer is already linked to another user
        const { data: customerLink } = await serviceClient
          .from("customer_auth_links")
          .select("user_id, portal_status")
          .eq("customer_id", customer.id)
          .maybeSingle();

        if (customerLink) {
          if (customerLink.portal_status === "disabled") {
            return json({ linked: false, error: "Your portal access has been disabled. Please call us if you need help." }, 403);
          }
          return json({
            linked: false,
            error: "This customer account is already linked to another login. Please call us if you need help.",
          }, 409);
        }

        // Create the link — setup_complete depends on whether the customer record
        // was pre-existing (manager created it) or the user needs to fill in details.
        // If the manager sent an invite for a pre-existing customer, mark setup_complete=true.
        // If this is a self-service signup with no prior customer record, it's handled above.
        const { error: linkError } = await serviceClient
          .from("customer_auth_links")
          .insert({
            user_id: user.id,
            customer_id: customer.id,
            setup_complete: true,
            last_login_at: new Date().toISOString(),
          });

        if (linkError) {
          console.error("Link creation error:", linkError.message);
          return json({ error: "Unable to link your account. Please try again." }, 500);
        }

        return json({ linked: true, customer_id: customer.id, customer, setup_complete: true });
      }

      // ===== CREATE ACCOUNT (for users who have no shop_customers record) =====
      if (path === "create-account" && req.method === "POST") {
        const authHeader = req.headers.get("Authorization") || "";
        const token = authHeader.replace("Bearer ", "");
        if (!token) return json({ error: "Authentication required." }, 401);

        const userClient = createUserClient(token);
        const { data: { user }, error: userError } = await userClient.auth.getUser();

        if (userError || !user) {
          return json({ error: "Authentication required." }, 401);
        }

        const serviceClient = createServiceClient();

        // Check if already linked
        const { data: existingLink } = await serviceClient
          .from("customer_auth_links")
          .select("customer_id, portal_status, setup_complete")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existingLink) {
          if (existingLink.portal_status === "disabled") {
            return json({ error: "Your portal access has been disabled. Please call us if you need help." }, 403);
          }
          await serviceClient
            .from("customer_auth_links")
            .update({ last_login_at: new Date().toISOString() })
            .eq("user_id", user.id);
          const { data: customer } = await serviceClient
            .from("shop_customers")
            .select("id, first_name, last_name, email, phone")
            .eq("id", existingLink.customer_id)
            .maybeSingle();
          return json({ linked: true, customer_id: existingLink.customer_id, customer, setup_complete: existingLink.setup_complete });
        }

        const body = await req.json();
        const { first_name, last_name, phone, address } = body;

        if (!first_name?.trim() || !last_name?.trim() || !phone?.trim()) {
          return json({ error: "First name, last name, and phone are required." }, 400);
        }

        const email = user.email;
        if (!email) {
          return json({ error: "No email associated with your account." }, 400);
        }

        // Create the shop_customers record
        const { data: newCustomer, error: custError } = await serviceClient
          .from("shop_customers")
          .insert({
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            address: address?.trim() || null,
          })
          .select("id, first_name, last_name, email, phone")
          .single();

        if (custError) {
          console.error("Customer creation error:", custError.message);
          return json({ error: "Unable to create your account. Please try again." }, 500);
        }

        // Link the auth user to the new customer record with setup_complete=true
        const { error: linkError } = await serviceClient
          .from("customer_auth_links")
          .insert({
            user_id: user.id,
            customer_id: newCustomer.id,
            setup_complete: true,
            last_login_at: new Date().toISOString(),
          });

        if (linkError) {
          console.error("Link creation error:", linkError.message);
          return json({ error: "Account created but linking failed. Please try signing in again." }, 500);
        }

        return json({ linked: true, customer_id: newCustomer.id, customer: newCustomer, setup_complete: true });
      }

      // ===== PORTAL ACCESS CHECK (public, no auth required) =====
      // Called from the customer login page "Set Up / Access My Account" flow.
      // Checks whether the email has portal access enabled and sends an invite
      // or password reset. NEVER creates a new auth user from the client side.
      if (path === "portal-access" && req.method === "POST") {
        const body = await req.json();
        const email = body?.email?.trim()?.toLowerCase();
        if (!email || !email.includes("@")) {
          return json({ error: "Please enter a valid email address." }, 400);
        }

        const serviceClient = createServiceClient();

        // 1. Find a shop_customers record matching this email
        const { data: customer } = await serviceClient
          .from("shop_customers")
          .select("id, email")
          .ilike("email", email)
          .maybeSingle();

        if (!customer) {
          return json({ error: "Customer Portal access has not been activated for this email. Please contact Fort Peck Auto to have your account enabled." }, 403);
        }

        // 2. Check for an existing auth link
        const { data: link } = await serviceClient
          .from("customer_auth_links")
          .select("user_id, portal_status, setup_complete")
          .eq("customer_id", customer.id)
          .maybeSingle();

        if (link && link.portal_status === "disabled") {
          return json({ error: "Your portal access has been disabled. Please contact Fort Peck Auto if you need help." }, 403);
        }

        // 3. Look up the auth user by email using getUserByEmail (not listUsers)
        const { data: existingUserData, error: userLookupError } = await serviceClient.auth.admin.getUserByEmail(email);

        if (existingUserData?.user) {
          // Auth user exists — send password reset so they can set/restore their password
          const redirectTo = `${Deno.env.get("SUPABASE_AUTH_EXTERNAL_REDIRECT_URL") || "https://wolfpointautoparts.com"}/auth-callback`;
          const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(email, {
            redirectTo,
          });
          if (resetError) {
            console.error("portal-access: reset error:", resetError.message);
            return json({ error: "Unable to send setup email. Please try again or call us." }, 500);
          }
          return json({ success: true, action: "reset_sent" });
        }

        // 4. No auth user yet — send invite (creates auth user server-side)
        const redirectTo = `${Deno.env.get("SUPABASE_AUTH_EXTERNAL_REDIRECT_URL") || "https://wolfpointautoparts.com"}/auth-callback`;
        const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
          data: { customer_id: customer.id, portal_invite: true },
          redirectTo,
        });

        if (inviteError) {
          if (inviteError.message.includes("already") || inviteError.message.includes("been registered") || inviteError.message.includes("User already registered")) {
            // User exists but getUserByEmail didn't find them — send reset
            const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(email, { redirectTo });
            if (resetError) {
              console.error("portal-access: fallback reset error:", resetError.message);
              return json({ error: "Unable to send setup email. Please try again or call us." }, 500);
            }
            return json({ success: true, action: "reset_sent" });
          }
          console.error("portal-access: invite error:", inviteError.message);
          return json({ error: "Unable to send invitation email. Please try again or call us." }, 500);
        }

        // 5. If link exists (e.g. re-enable), make sure it's active
        if (link) {
          await serviceClient
            .from("customer_auth_links")
            .update({ portal_status: "active" })
            .eq("customer_id", customer.id);
        }

        return json({ success: true, action: "invite_sent" });
      }

      // ===== Manager routes do NOT require customer auth =====
      // They use X-Manager-Token (employee session) verified via verifyManager().
      const isManagerRoute = path.startsWith("manager/");
      const isPublicRoute = path === "resolve-username" || path === "portal-access";

      if (!isManagerRoute && !isPublicRoute) {
      // ===== All other routes require authenticated user =====
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      if (!token) {
        return json({ error: "Authentication required." }, 401);
      }

      const userClient = createUserClient(token);
      const { data: { user }, error: userError } = await userClient.auth.getUser();

      if (userError || !user) {
        return json({ error: "Authentication required." }, 401);
      }

      // Get the customer link via the user's authenticated client (RLS enforced)
      const { data: link } = await userClient
        .from("customer_auth_links")
        .select("customer_id, portal_status, setup_complete")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!link) {
        return json({ error: "Your account is not linked to a customer record. Please call us." }, 403);
      }

      if (link.portal_status === "disabled") {
        return json({ error: "Your portal access has been disabled. Please call us if you need help." }, 403);
      }

      const customerId = link.customer_id;

      // ===== DASHBOARD =====
      if (path === "dashboard" && req.method === "GET") {
        const { data: customer } = await userClient
          .from("shop_customers")
          .select("id, first_name, last_name, phone, email, address")
          .eq("id", customerId)
          .maybeSingle();

        const { data: vehicles } = await userClient
          .from("shop_vehicles")
          .select("id, vin, year, make, model, trim, color, mileage, engine")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        const { data: workOrders } = await userClient
          .from("shop_work_orders")
          .select("id, work_order_number, status, total, balance_due, created_at, updated_at, invoice_date, payment_status, vehicle_id")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        const estimates = workOrders?.filter(wo => wo.status === "estimate") || [];
        const activeRepairs = workOrders?.filter(wo => ["approved", "in_progress", "waiting_parts"].includes(wo.status)) || [];
        const invoices = workOrders?.filter(wo => wo.status === "invoiced" || wo.status === "paid") || [];
        const balanceDue = invoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

        const { data: approvals } = await userClient
          .from("estimate_approvals")
          .select("work_order_id, decision, decided_at")
          .eq("customer_id", customerId);

        // Vehicle lookup map
        const vehicleMap = new Map((vehicles || []).map(v => [v.id, v]));

        // Enrich work orders with vehicle info
        const enrichedWOs = (workOrders || []).map(wo => ({
          ...wo,
          vehicle: vehicleMap.get(wo.vehicle_id) || null,
        }));

        return json({
          customer,
          vehicles: vehicles || [],
          workOrders: enrichedWOs,
          stats: {
            estimatesAwaitingApproval: estimates.length,
            activeRepairs: activeRepairs.length,
            balanceDue,
            totalInvoices: invoices.length,
          },
          approvals: approvals || [],
        });
      }

      // ===== VEHICLES =====
      if (path === "vehicles" && req.method === "GET") {
        const { data: vehicles } = await userClient
          .from("shop_vehicles")
          .select("id, vin, year, make, model, trim, color, mileage, engine, transmission, drivetrain, fuel_type, body_style")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        return json({ vehicles: vehicles || [] });
      }

      if (path === "vehicles/add" && req.method === "POST") {
        const body = await req.json();
        const { vin, year, make, model, trim, color, mileage, engine, transmission, drivetrain, fuel_type, body_style, vin_decoded } = body;

        if (vin) {
          const { data: existing } = await userClient
            .from("shop_vehicles")
            .select("id")
            .eq("customer_id", customerId)
            .ilike("vin", vin)
            .maybeSingle();

          if (existing) {
            return json({ error: "This vehicle is already in your garage." }, 400);
          }
        }

        const { data: vehicle, error } = await userClient
          .from("shop_vehicles")
          .insert({
            customer_id: customerId,
            vin: vin || null,
            year: year || null,
            make: make || null,
            model: model || null,
            trim: trim || null,
            color: color || null,
            mileage: mileage || null,
            engine: engine || null,
            transmission: transmission || null,
            drivetrain: drivetrain || null,
            fuel_type: fuel_type || null,
            body_style: body_style || null,
            vin_decoded: vin_decoded || false,
          })
          .select()
          .single();

        if (error) {
          console.error("Vehicle add error:", error.message);
          return json({ error: "Unable to add vehicle." }, 500);
        }

        return json({ vehicle });
      }

      // ===== ESTIMATE DETAIL =====
      if (path === "estimate" && req.method === "GET") {
        const woId = url.searchParams.get("id");
        if (!woId) return json({ error: "ID required" }, 400);

        const { data: wo } = await userClient
          .from("shop_work_orders")
          .select("id, work_order_number, status, subtotal, tax, shop_supplies, total, balance_due, created_at, updated_at, notes, vehicle_id")
          .eq("id", woId)
          .maybeSingle();

        if (!wo) return json({ error: "Estimate not found" }, 404);

        const { data: laborOps } = await userClient
          .from("shop_labor_operations")
          .select("id, operation_description, charged_hours, labor_rate, labor_total")
          .eq("work_order_id", woId)
          .order("display_order", { ascending: true });

        const { data: parts } = await userClient
          .from("shop_parts")
          .select("id, description, sell_price, part_number")
          .eq("work_order_id", woId)
          .order("display_order", { ascending: true });

        const { data: vehicle } = await userClient
          .from("shop_vehicles")
          .select("year, make, model, vin, mileage")
          .eq("id", wo.vehicle_id)
          .maybeSingle();

        const { data: approval } = await userClient
          .from("estimate_approvals")
          .select("decision, decided_at, notes")
          .eq("work_order_id", woId)
          .order("decided_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Compute hash of current estimate state
        const laborHash = (laborOps || []).map(op => `${op.operation_description}:${op.charged_hours}:${op.labor_total}`).join("|");
        const partsHash = (parts || []).map(p => `${p.description}:${p.sell_price}`).join("|");
        const estimateHash = await hashString(laborHash + "|" + partsHash + "|" + wo.total);

        const laborTotal = (laborOps || []).reduce((sum, op) => sum + Number(op.labor_total || 0), 0);
        const partsTotal = (parts || []).reduce((sum, p) => sum + Number(p.sell_price || 0), 0);

        // Strip internal notes from customer view
        const customerNotes = wo.notes && wo.notes.startsWith("CUSTOMER SERVICE REQUEST:")
          ? wo.notes
          : null;

        return json({
          estimate: {
            id: wo.id,
            work_order_number: wo.work_order_number,
            status: wo.status,
            subtotal: wo.subtotal,
            tax: wo.tax,
            shop_supplies: wo.shop_supplies,
            total: wo.total,
            created_at: wo.created_at,
            updated_at: wo.updated_at,
            customerNotes,
            vehicle,
            laborOperations: laborOps || [],
            parts: parts || [],
            laborTotal,
            partsTotal,
            estimateHash,
            existingApproval: approval || null,
          },
        });
      }

      // ===== APPROVE / DECLINE ESTIMATE =====
      if (path === "estimate/respond" && req.method === "POST") {
        const { work_order_id, decision, estimate_total, estimate_hash, notes } = await req.json();

        const { data: result, error } = await userClient.rpc("approve_or_decline_estimate", {
          p_work_order_id: work_order_id,
          p_decision: decision,
          p_estimate_total: estimate_total,
          p_estimate_hash: estimate_hash,
          p_notes: notes || null,
        });

        if (error) {
          console.error("Estimate response error:", error.message);
          return json({ error: "Unable to process your response." }, 500);
        }

        if (result && !result.success) {
          return json({ error: result.error || "Unable to process" }, 400);
        }

        return json({ success: true, decision: result?.decision });
      }

      // ===== INVOICE DETAIL =====
      if (path === "invoice" && req.method === "GET") {
        const woId = url.searchParams.get("id");
        if (!woId) return json({ error: "ID required" }, 400);

        const { data: wo } = await userClient
          .from("shop_work_orders")
          .select("id, work_order_number, status, subtotal, tax, shop_supplies, total, balance_due, created_at, invoice_date, payment_status, vehicle_id")
          .eq("id", woId)
          .maybeSingle();

        if (!wo) return json({ error: "Invoice not found" }, 404);

        const { data: payments } = await userClient
          .from("shop_payments")
          .select("id, amount, method, created_at, payment_status, processor")
          .eq("work_order_id", woId)
          .order("created_at", { ascending: false });

        const { data: laborOps } = await userClient
          .from("shop_labor_operations")
          .select("operation_description, charged_hours, labor_total")
          .eq("work_order_id", woId)
          .order("display_order", { ascending: true });

        const { data: parts } = await userClient
          .from("shop_parts")
          .select("description, sell_price, part_number")
          .eq("work_order_id", woId)
          .order("display_order", { ascending: true });

        const { data: vehicle } = await userClient
          .from("shop_vehicles")
          .select("year, make, model, vin, mileage")
          .eq("id", wo.vehicle_id)
          .maybeSingle();

        const { data: token } = await userClient
          .from("shop_invoice_tokens")
          .select("token")
          .eq("work_order_id", woId)
          .eq("revoked", false)
          .maybeSingle();

        const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

        return json({
          invoice: {
            ...wo,
            vehicle,
            payments: payments || [],
            laborOperations: laborOps || [],
            parts: parts || [],
            totalPaid,
            paymentToken: token?.token || null,
          },
        });
      }

      // ===== PAYMENTS =====
      if (path === "payments" && req.method === "GET") {
        const { data: workOrders } = await userClient
          .from("shop_work_orders")
          .select("id, work_order_number")
          .eq("customer_id", customerId);

        const woIds = (workOrders || []).map(wo => wo.id);
        if (woIds.length === 0) return json({ payments: [] });

        const { data: payments } = await userClient
          .from("shop_payments")
          .select("id, amount, method, created_at, payment_status, processor, work_order_id")
          .in("work_order_id", woIds)
          .order("created_at", { ascending: false });

        const woMap = new Map((workOrders || []).map(wo => [wo.id, wo.work_order_number]));
        const paymentsWithWO = (payments || []).map(p => ({
          ...p,
          work_order_number: woMap.get(p.work_order_id) || "",
        }));

        return json({ payments: paymentsWithWO });
      }

      // ===== MESSAGES =====
      if (path === "messages" && req.method === "GET") {
        const { data: workOrders } = await userClient
          .from("shop_work_orders")
          .select("id, work_order_number, vehicle_id")
          .eq("customer_id", customerId);

        const woIds = (workOrders || []).map(wo => wo.id);
        if (woIds.length === 0) return json({ conversations: [] });

        const { data: conversations } = await userClient
          .from("message_conversations")
          .select("id, record_id, record_type, record_label, vehicle_label, unread_count, last_message_preview, last_message_at, created_at")
          .eq("module", "shop")
          .in("record_id", woIds)
          .order("last_message_at", { ascending: false, nullsFirst: false });

        return json({ conversations: conversations || [] });
      }

      if (path === "messages/thread" && req.method === "GET") {
        const convId = url.searchParams.get("conversation_id");
        if (!convId) return json({ error: "Conversation ID required" }, 400);

        const { data: messages } = await userClient
          .from("message_messages")
          .select("id, direction, body, is_read, created_at, sent_by")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true });

        const { data: conv } = await userClient
          .from("message_conversations")
          .select("id, record_id, record_type, record_label, vehicle_label")
          .eq("id", convId)
          .maybeSingle();

        return json({ conversation: conv, messages: messages || [] });
      }

      if (path === "messages/send" && req.method === "POST") {
        const { conversation_id, body } = await req.json();
        if (!conversation_id || !body?.trim()) {
          return json({ error: "Conversation and message are required" }, 400);
        }

        const { data: conv } = await userClient
          .from("message_conversations")
          .select("id, record_id, record_label, vehicle_label, contact_name, contact_phone, contact_email")
          .eq("id", conversation_id)
          .eq("module", "shop")
          .maybeSingle();

        if (!conv) {
          return json({ error: "Conversation not found" }, 404);
        }

        const { data: msg, error: msgError } = await userClient
          .from("message_messages")
          .insert({
            conversation_id,
            direction: "incoming",
            body: body.trim(),
            is_read: false,
            delivery_status: "pending",
            sent_by: "customer",
          })
          .select()
          .single();

        if (msgError) {
          console.error("Message send error:", msgError.message);
          return json({ error: "Unable to send message" }, 500);
        }

        await userClient
          .from("message_conversations")
          .update({
            last_message_preview: body.trim().slice(0, 100),
            last_message_at: new Date().toISOString(),
            is_unassigned: true,
          })
          .eq("id", conversation_id);

        return json({ success: true, message: msg });
      }

      // ===== SERVICE REQUEST =====
      if (path === "service-request" && req.method === "POST") {
        const { vehicle_id, problem } = await req.json();
        if (!vehicle_id || !problem?.trim()) {
          return json({ error: "Vehicle and problem description are required" }, 400);
        }

        const { data: result, error } = await userClient.rpc("create_customer_service_request", {
          p_vehicle_id: vehicle_id,
          p_problem: problem.trim(),
        });

        if (error) {
          console.error("Service request error:", error.message);
          return json({ error: "Unable to create service request" }, 500);
        }

        if (result && !result.success) {
          return json({ error: result.error || "Unable to create request" }, 400);
        }

        // Create a message conversation for this work order
        const { data: vehicle } = await userClient
          .from("shop_vehicles")
          .select("year, make, model")
          .eq("id", vehicle_id)
          .maybeSingle();

        const { data: customer } = await userClient
          .from("shop_customers")
          .select("first_name, last_name, phone, email")
          .eq("id", customerId)
          .maybeSingle();

        const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "";
        const customerName = customer ? `${customer.first_name} ${customer.last_name}`.trim() : "";

        await userClient.from("message_conversations").insert({
          module: "shop",
          contact_name: customerName,
          contact_phone: customer?.phone || "",
          contact_email: customer?.email || "",
          record_id: result.work_order_id,
          record_type: "work_order",
          record_label: result.work_order_number,
          vehicle_label: vehicleLabel,
          unread_count: 1,
          last_message_preview: `Service request: ${problem.trim().slice(0, 80)}`,
          last_message_at: new Date().toISOString(),
          is_unassigned: true,
        });

        return json({ success: true, work_order_id: result.work_order_id, work_order_number: result.work_order_number });
      }

      // ===== UPDATE PROFILE =====
      if (path === "profile" && req.method === "PUT") {
        const { first_name, last_name, phone, email, address } = await req.json();

        const updates: Record<string, string> = {};
        if (first_name !== undefined) updates.first_name = first_name.trim();
        if (last_name !== undefined) updates.last_name = last_name.trim();
        if (phone !== undefined) updates.phone = phone.trim();
        if (email !== undefined) updates.email = email.trim();
        if (address !== undefined) updates.address = address.trim();
        updates.updated_at = new Date().toISOString();

        const { error } = await userClient
          .from("shop_customers")
          .update(updates)
          .eq("id", customerId);

        if (error) {
          console.error("Profile update error:", error.message);
          return json({ error: "Unable to update profile" }, 500);
        }

        return json({ success: true });
      }

      // ===== VIN DECODE =====
      if (path === "decode-vin" && req.method === "GET") {
        const vin = url.searchParams.get("vin");
        if (!vin) return json({ error: "VIN required" }, 400);

        const nhtsaUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;
        const resp = await fetch(nhtsaUrl);
        if (!resp.ok) return json({ error: "Unable to decode VIN" }, 502);
        const data = await resp.json();

        const getField = (results: any[], variable: string): string => {
          const entry = results.find((r: any) => r.Variable === variable);
          const val = entry?.Value;
          if (!val || val === "null" || val === "Not Applicable") return "";
          return val;
        };

        const make = getField(data.Results, "Make");
        const model = getField(data.Results, "Model");
        const yearStr = getField(data.Results, "Model Year");
        const errorCode = getField(data.Results, "Error Code");

        if (errorCode && errorCode !== "0") {
          return json({ error: getField(data.Results, "Error Text") || "Invalid VIN" }, 400);
        }

        if (!make || !model) {
          return json({ error: "Unable to decode this VIN" }, 400);
        }

        return json({
          vin: vin.toUpperCase(),
          year: parseInt(yearStr) || 0,
          make,
          model,
          trim: getField(data.Results, "Trim") || getField(data.Results, "Series") || "Base",
          engine: getField(data.Results, "Displacement (L)") || "N/A",
          transmission: getField(data.Results, "Transmission Style") || "N/A",
          bodyStyle: getField(data.Results, "Body Class") || "N/A",
          driveType: getField(data.Results, "Drive Type") || "N/A",
          fuelType: getField(data.Results, "Fuel Type - Primary") || "N/A",
        });
      }

      } // end of customer-authenticated routes

      // ===== MANAGER ENDPOINTS =====
      // These are authenticated via X-Manager-Token header (employee session)
      // and verified against the employees table.

      if (path === "manager/customers" && req.method === "GET") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const serviceClient = createServiceClient();

        // Get all customers with their portal link info
        const { data: customers } = await serviceClient
          .from("shop_customers")
          .select("id, first_name, last_name, phone, email, address, notes, created_at")
          .order("created_at", { ascending: false });

        const { data: links } = await serviceClient
          .from("customer_auth_links")
          .select("customer_id, user_id, portal_status, setup_complete, last_login_at, created_at, username");

        const { data: vehicles } = await serviceClient
          .from("shop_vehicles")
          .select("id, customer_id, vin, year, make, model");

        const linkMap = new Map((links || []).map((l: any) => [l.customer_id, l]));
        const vehicleMap = new Map<string, any[]>();
        for (const v of (vehicles || [])) {
          if (!vehicleMap.has(v.customer_id)) vehicleMap.set(v.customer_id, []);
          vehicleMap.get(v.customer_id)!.push(v);
        }

        const enriched = (customers || []).map((c: any) => {
          const link = linkMap.get(c.id);
          let portalStatus = "none";
          if (link) {
            if (link.portal_status === "disabled") portalStatus = "disabled";
            else if (!link.setup_complete) portalStatus = "setup_incomplete";
            else portalStatus = "active";
          }
          return {
            ...c,
            portal_status: portalStatus,
            portal_user_id: link?.user_id || null,
            setup_complete: link?.setup_complete ?? false,
            last_login_at: link?.last_login_at || null,
            portal_link_created_at: link?.created_at || null,
            vehicles: vehicleMap.get(c.id) || [],
          };
        });

        return json({ customers: enriched });
      }

      if (path === "manager/customer" && req.method === "GET") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const customerId = url.searchParams.get("id");
        if (!customerId) return json({ error: "Customer ID required" }, 400);

        const serviceClient = createServiceClient();

        const { data: customer } = await serviceClient
          .from("shop_customers")
          .select("*")
          .eq("id", customerId)
          .maybeSingle();

        if (!customer) return json({ error: "Customer not found" }, 404);

        const { data: link } = await serviceClient
          .from("customer_auth_links")
          .select("user_id, portal_status, setup_complete, last_login_at, created_at, username")
          .eq("customer_id", customerId)
          .maybeSingle();

        const { data: vehicles } = await serviceClient
          .from("shop_vehicles")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        const { data: workOrders } = await serviceClient
          .from("shop_work_orders")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        const woIds = (workOrders || []).map((wo: any) => wo.id);
        let payments: any[] = [];
        if (woIds.length > 0) {
          const { data: payData } = await serviceClient
            .from("shop_payments")
            .select("*")
            .in("work_order_id", woIds)
            .order("created_at", { ascending: false });
          payments = payData || [];
        }

        // Towing records linked to this customer
        const { data: towingRecords } = await serviceClient
          .from("towing_impounds")
          .select("id, tow_date, tow_location, vin, year, make, model, plate, vehicle_status, tow_reason, released_at, shop_vehicle_id")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        // Part inquiries linked to this customer
        const { data: inquiries } = await serviceClient
          .from("part_inquiries")
          .select("id, part_needed, customer_name, phone, email, vin, year, make, model, status, created_at")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        // Unlinked towing records that match by VIN to this customer's vehicles
        const customerVins = (vehicles || []).map((v: any) => v.vin).filter(Boolean);
        let unlinkedTowing: any[] = [];
        if (customerVins.length > 0) {
          const { data: unlinkedData } = await serviceClient
            .from("towing_impounds")
            .select("id, tow_date, tow_location, vin, year, make, model, plate, vehicle_status, tow_reason")
            .is("customer_id", null)
            .in("vin", customerVins);
          unlinkedTowing = unlinkedData || [];
        }

        return json({
          customer,
          portal_link: link || null,
          vehicles: vehicles || [],
          workOrders: workOrders || [],
          payments,
          towing: towingRecords || [],
          unlinkedTowing: unlinkedTowing,
          inquiries: inquiries || [],
        });
      }

      if (path === "manager/customer/create" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { first_name, last_name, phone, email, address } = body;

        if (!first_name?.trim() || !last_name?.trim()) {
          return json({ error: "First name and last name are required" }, 400);
        }

        const serviceClient = createServiceClient();

        // Check for duplicates before creating
        const { data: dupCheck } = await serviceClient.rpc("customer_duplicate_check", {
          p_phone: phone?.trim() || null,
          p_email: email?.trim() || null,
          p_first_name: first_name.trim(),
          p_last_name: last_name.trim(),
        });

        if (dupCheck?.matches?.length > 0) {
          return json({ success: false, error: "Possible duplicate customer found", duplicates: dupCheck.matches }, 409);
        }

        const { data: customer, error: custError } = await serviceClient
          .from("shop_customers")
          .insert({
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            phone: phone?.trim() || null,
            email: email?.trim() || null,
            address: address?.trim() || null,
          })
          .select("id, first_name, last_name, phone, email, address")
          .single();

        if (custError) {
          return json({ error: "Unable to create customer" }, 500);
        }

        return json({ success: true, customer });
      }

      if (path === "manager/customer/update" && req.method === "PUT") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id, first_name, last_name, phone, email, address } = body;

        if (!customer_id) return json({ error: "Customer ID required" }, 400);

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (first_name !== undefined) updates.first_name = first_name.trim();
        if (last_name !== undefined) updates.last_name = last_name.trim();
        if (phone !== undefined) updates.phone = phone.trim() || null;
        if (email !== undefined) updates.email = email.trim() || null;
        if (address !== undefined) updates.address = address.trim() || null;

        const serviceClient = createServiceClient();
        const { error } = await serviceClient
          .from("shop_customers")
          .update(updates)
          .eq("id", customer_id);

        if (error) {
          return json({ error: "Unable to update customer" }, 500);
        }

        return json({ success: true });
      }

      if (path === "manager/portal/enable" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id, email: confirmEmail } = body;

        if (!customer_id) return json({ error: "Customer ID required" }, 400);

        const serviceClient = createServiceClient();

        // 1. Get customer
        const { data: customer, error: custError } = await serviceClient
          .from("shop_customers")
          .select("id, email")
          .eq("id", customer_id)
          .maybeSingle();

        if (custError) {
          console.error("portal/enable: customer lookup error:", custError.message);
          return json({ error: "Unable to look up customer record." }, 500);
        }
        if (!customer) return json({ error: "Customer not found" }, 404);

        const email = (confirmEmail || customer.email || "").trim().toLowerCase();
        if (!email) return json({ error: "Customer has no email address. Add an email first." }, 400);

        const redirectTo = `${Deno.env.get("SUPABASE_AUTH_EXTERNAL_REDIRECT_URL") || "https://wolfpointautoparts.com"}/auth-callback`;

        // 2. Check existing link
        const { data: existingLink, error: linkQueryError } = await serviceClient
          .from("customer_auth_links")
          .select("user_id, portal_status, setup_complete")
          .eq("customer_id", customer_id)
          .maybeSingle();

        if (linkQueryError) {
          console.error("portal/enable: link lookup error:", linkQueryError.message);
          return json({ error: "Unable to check portal status. Please try again." }, 500);
        }

        if (existingLink) {
          // 3a. Existing link — re-enable if disabled
          if (existingLink.portal_status === "disabled") {
            const { error: enableError } = await serviceClient
              .from("customer_auth_links")
              .update({ portal_status: "active" })
              .eq("customer_id", customer_id);
            if (enableError) {
              console.error("portal/enable: re-enable error:", enableError.message);
              return json({ error: "Unable to re-enable portal. Please try again." }, 500);
            }
          }
          // Send invite/reset
          const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
            data: { customer_id, portal_invite: true },
            redirectTo,
          });
          if (inviteError) {
            // User already exists — send password reset instead
            if (inviteError.message.includes("already") || inviteError.message.includes("been registered") || inviteError.message.includes("User already registered")) {
              const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(email, { redirectTo });
              if (resetError) {
                console.error("portal/enable: reset error:", resetError.message);
                return json({ error: "Account exists but unable to send password reset email. Please try again or use 'Send Password Reset'." }, 500);
              }
              return json({ success: true, action: "reset_sent", message: "Account exists. Password reset email sent." });
            }
            console.error("portal/enable: invite error:", inviteError.message);
            return json({ error: "Unable to send invitation email: " + inviteError.message }, 500);
          }
          return json({ success: true, action: "re_enabled", message: "Portal re-enabled. Invitation email sent." });
        }

        // 3b. No existing link — send invite (creates auth user server-side)
        const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
          data: { customer_id, portal_invite: true },
          redirectTo,
        });

        if (inviteError) {
          // User already exists in auth.users but not linked — send reset + create link
          if (inviteError.message.includes("already") || inviteError.message.includes("been registered") || inviteError.message.includes("User already registered")) {
            const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(email, { redirectTo });
            if (resetError) {
              console.error("portal/enable: reset error for existing user:", resetError.message);
              return json({ error: "Account exists but unable to send password reset email. Please try 'Send Password Reset'." }, 500);
            }
            // Try to find and link the existing user via getUserByEmail
            const { data: userData, error: userError } = await serviceClient.auth.admin.getUserByEmail(email);
            if (userError || !userData?.user) {
              console.error("portal/enable: getUserByEmail error:", userError?.message);
              // Reset was sent, but we couldn't link — tell the manager
              return json({ success: true, action: "reset_sent", message: "Account exists. Password reset email sent, but auto-linking failed. Customer can still log in." });
            }
            // Create the link
            const { error: insertLinkError } = await serviceClient
              .from("customer_auth_links")
              .insert({
                user_id: userData.user.id,
                customer_id,
                portal_status: "active",
                setup_complete: false,
                last_login_at: new Date().toISOString(),
              });
            if (insertLinkError) {
              console.error("portal/enable: link insert error:", insertLinkError.message);
              // Reset was sent — don't fail the whole operation
              return json({ success: true, action: "reset_sent", message: "Account exists. Password reset email sent, but linking failed. Please try again." });
            }
            return json({ success: true, action: "reset_sent", message: "Account exists. Password reset email sent and portal linked." });
          }
          console.error("portal/enable: invite error:", inviteError.message);
          return json({ error: "Unable to send invitation email: " + inviteError.message }, 500);
        }

        return json({ success: true, action: "invite_sent", message: "Portal account created. Invitation email sent to " + email + "." });
      }

      if (path === "manager/portal/disable" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id } = body;
        if (!customer_id) return json({ error: "Customer ID required" }, 400);

        const serviceClient = createServiceClient();
        const { data: link } = await serviceClient
          .from("customer_auth_links")
          .select("user_id")
          .eq("customer_id", customer_id)
          .maybeSingle();

        if (!link) return json({ error: "No portal account for this customer" }, 404);

        await serviceClient
          .from("customer_auth_links")
          .update({ portal_status: "disabled" })
          .eq("customer_id", customer_id);

        return json({ success: true });
      }

      if (path === "manager/portal/invite" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id } = body;
        if (!customer_id) return json({ error: "Customer ID required" }, 400);

        const serviceClient = createServiceClient();
        const { data: customer } = await serviceClient
          .from("shop_customers")
          .select("email")
          .eq("id", customer_id)
          .maybeSingle();

        if (!customer?.email) return json({ error: "Customer has no email" }, 400);

        const redirectTo = `${Deno.env.get("SUPABASE_AUTH_EXTERNAL_REDIRECT_URL") || "https://wolfpointautoparts.com"}/auth-callback`;
        const { error } = await serviceClient.auth.admin.inviteUserByEmail(customer.email, {
          data: { customer_id, portal_invite: true },
          redirectTo,
        });

        if (error && !error.message.includes("already") && !error.message.includes("been registered")) {
          return json({ error: "Unable to send invitation" }, 500);
        }

        return json({ success: true });
      }

      if (path === "manager/portal/reset-password" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id } = body;
        if (!customer_id) return json({ error: "Customer ID required" }, 400);

        const serviceClient = createServiceClient();
        const { data: customer } = await serviceClient
          .from("shop_customers")
          .select("email")
          .eq("id", customer_id)
          .maybeSingle();

        if (!customer?.email) return json({ error: "Customer has no email" }, 400);

        // Send password reset — the redirect URL will go to auth-callback
        const { error } = await serviceClient.auth.resetPasswordForEmail(customer.email, {
          redirectTo: `${Deno.env.get("SUPABASE_AUTH_EXTERNAL_REDIRECT_URL") || "https://wolfpointautoparts.com"}/auth-callback`,
        });

        if (error) {
          return json({ error: "Unable to send reset email" }, 500);
        }

        return json({ success: true });
      }

      // ===== MANAGER: GLOBAL SEARCH =====
      if (path === "manager/search" && req.method === "GET") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const query = url.searchParams.get("q") || "";
        if (query.length < 2) return json({ success: true, results: {} });

        const serviceClient = createServiceClient();
        const { data, error } = await serviceClient.rpc("global_search", {
          p_query: query,
          p_limit: 20,
        });

        if (error) {
          return json({ error: "Search failed" }, 500);
        }

        return json(data);
      }

      // ===== MANAGER: DUPLICATE CHECK =====
      if (path === "manager/duplicate-check" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { phone, email, first_name, last_name } = body;

        const serviceClient = createServiceClient();
        const { data, error } = await serviceClient.rpc("customer_duplicate_check", {
          p_phone: phone || null,
          p_email: email || null,
          p_first_name: first_name || null,
          p_last_name: last_name || null,
        });

        if (error) return json({ error: "Check failed" }, 500);
        return json(data);
      }

      // ===== MANAGER: LINK TOWING TO CUSTOMER =====
      if (path === "manager/link-towing" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { impound_id, customer_id, shop_vehicle_id } = body;
        if (!impound_id || !customer_id) return json({ error: "Impound ID and Customer ID required" }, 400);

        const serviceClient = createServiceClient();
        const { error } = await serviceClient.rpc("link_towing_to_customer", {
          p_impound_id: impound_id,
          p_customer_id: customer_id,
          p_shop_vehicle_id: shop_vehicle_id || null,
        });

        if (error) return json({ error: "Unable to link towing record" }, 500);
        return json({ success: true });
      }

      // ===== MANAGER: LINK INQUIRY TO CUSTOMER =====
      if (path === "manager/link-inquiry" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { inquiry_id, customer_id } = body;
        if (!inquiry_id || !customer_id) return json({ error: "Inquiry ID and Customer ID required" }, 400);

        const serviceClient = createServiceClient();
        const { error } = await serviceClient.rpc("link_inquiry_to_customer", {
          p_inquiry_id: inquiry_id,
          p_customer_id: customer_id,
        });

        if (error) return json({ error: "Unable to link inquiry" }, 500);
        return json({ success: true });
      }

      // ===== MANAGER: ADD VEHICLE TO CUSTOMER =====
      if (path === "manager/vehicle/add" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id, vin, year, make, model, trim, color, plate, mileage, engine } = body;
        if (!customer_id) return json({ error: "Customer ID required" }, 400);

        const serviceClient = createServiceClient();

        // Check for existing vehicle with same VIN
        if (vin) {
          const { data: existing } = await serviceClient
            .from("shop_vehicles")
            .select("id, customer_id")
            .ilike("vin", vin)
            .maybeSingle();

          if (existing) {
            return json({
              success: false,
              error: "A vehicle with this VIN already exists",
              existing_vehicle: existing,
            }, 409);
          }
        }

        const { data: vehicle, error } = await serviceClient
          .from("shop_vehicles")
          .insert({
            customer_id,
            vin: vin?.toUpperCase() || null,
            year: year || null,
            make: make || null,
            model: model || null,
            trim: trim || null,
            color: color || null,
            plate: plate?.toUpperCase() || null,
            mileage: mileage || null,
            engine: engine || null,
          })
          .select("*")
          .single();

        if (error) return json({ error: "Unable to add vehicle" }, 500);
        return json({ success: true, vehicle });
      }

      // ===== MANAGER: LINK EXISTING VEHICLE TO CUSTOMER =====
      if (path === "manager/vehicle/link" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { vehicle_id, customer_id } = body;
        if (!vehicle_id || !customer_id) return json({ error: "Vehicle ID and Customer ID required" }, 400);

        const serviceClient = createServiceClient();

        // Get vehicle current owner for confirmation
        const { data: vehicle } = await serviceClient
          .from("shop_vehicles")
          .select("customer_id, vin, year, make, model")
          .eq("id", vehicle_id)
          .maybeSingle();

        if (!vehicle) return json({ error: "Vehicle not found" }, 404);

        // Update ownership — this reassigns the vehicle to the new customer
        // Historical records (work orders, etc.) still reference the old customer_id
        // so service history is preserved on the work order itself
        const { error } = await serviceClient
          .from("shop_vehicles")
          .update({ customer_id })
          .eq("id", vehicle_id);

        if (error) return json({ error: "Unable to link vehicle" }, 500);
        return json({ success: true, vehicle });
      }

      // ===== MANAGER: CREATE CUSTOMER LOGIN (username + password) =====
      if (path === "manager/portal/create-login" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id, username, password, email: bodyEmail, require_change } = body;

        if (!customer_id) return json({ error: "Customer ID required" }, 400);
        if (!username?.trim()) return json({ error: "Username is required" }, 400);
        if (!password || password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

        const serviceClient = createServiceClient();

        // 1. Get customer
        const { data: customer, error: custError } = await serviceClient
          .from("shop_customers")
          .select("id, email")
          .eq("id", customer_id)
          .maybeSingle();

        if (custError) return json({ error: "Unable to look up customer" }, 500);
        if (!customer) return json({ error: "Customer not found" }, 404);

        const email = (bodyEmail || customer.email || "").trim().toLowerCase();
        if (!email) return json({ error: "Customer needs an email address. Add one first." }, 400);

        // 2. Check username uniqueness (case-insensitive)
        const { data: existingUsername } = await serviceClient
          .from("customer_auth_links")
          .select("customer_id")
          .ilike("username", username.trim())
          .maybeSingle();

        if (existingUsername && existingUsername.customer_id !== customer_id) {
          return json({ error: "That username is already taken. Choose another." }, 409);
        }

        // 3. Check existing link
        const { data: existingLink } = await serviceClient
          .from("customer_auth_links")
          .select("user_id, portal_status, setup_complete")
          .eq("customer_id", customer_id)
          .maybeSingle();

        const redirectTo = `${Deno.env.get("SUPABASE_AUTH_EXTERNAL_REDIRECT_URL") || "https://wolfpointautoparts.com"}/auth-callback`;

        if (existingLink?.user_id) {
          // Auth user already exists — update password + username
          const { error: updateErr } = await serviceClient.auth.admin.updateUserById(
            existingLink.user_id,
            { password, email_confirm: true }
          );
          if (updateErr) {
            console.error("create-login: updateUserById error:", updateErr.message);
            return json({ error: "Account exists but password update failed: " + updateErr.message }, 500);
          }

          // Update link with username + ensure active
          await serviceClient
            .from("customer_auth_links")
            .update({
              portal_status: "active",
              setup_complete: !require_change,
              username: username.trim().toLowerCase(),
            })
            .eq("customer_id", customer_id);

          return json({ success: true, action: "updated", message: "Login credentials updated. Username: " + username });
        }

        // 4. No existing link — check if auth user already exists for this email
        const { data: existingUser } = await serviceClient.auth.admin.getUserByEmail(email);

        let userId: string;

        if (existingUser?.user) {
          // Auth user exists but no link — update password and link
          userId = existingUser.user.id;
          const { error: updateErr } = await serviceClient.auth.admin.updateUserById(
            userId,
            { password, email_confirm: true }
          );
          if (updateErr) {
            console.error("create-login: update existing user error:", updateErr.message);
            return json({ error: "Account exists but password update failed: " + updateErr.message }, 500);
          }
        } else {
          // 5. Create new auth user with password
          const { data: newUser, error: createErr } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { customer_id, portal_invite: true },
          });

          if (createErr) {
            console.error("create-login: createUser error:", createErr.message);
            return json({ error: "Unable to create login account: " + createErr.message }, 500);
          }
          userId = newUser.user.id;
        }

        // 6. Create or update the link
        if (existingLink) {
          await serviceClient
            .from("customer_auth_links")
            .update({
              user_id: userId,
              portal_status: "active",
              setup_complete: !require_change,
              username: username.trim().toLowerCase(),
            })
            .eq("customer_id", customer_id);
        } else {
          const { error: insertErr } = await serviceClient
            .from("customer_auth_links")
            .insert({
              user_id: userId,
              customer_id,
              portal_status: "active",
              setup_complete: !require_change,
              username: username.trim().toLowerCase(),
              last_login_at: new Date().toISOString(),
            });

          if (insertErr) {
            console.error("create-login: link insert error:", insertErr.message);
            // Auth user was created but link failed — don't create another
            return json({ success: true, action: "partial", message: "Login created but linking failed. Please try again — do NOT create another account." });
          }
        }

        return json({ success: true, action: "created", message: "Customer login created. Username: " + username });
      }

      // ===== MANAGER: RESET CUSTOMER PASSWORD =====
      if (path === "manager/portal/set-password" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id, password, require_change } = body;

        if (!customer_id) return json({ error: "Customer ID required" }, 400);
        if (!password || password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

        const serviceClient = createServiceClient();

        const { data: link } = await serviceClient
          .from("customer_auth_links")
          .select("user_id")
          .eq("customer_id", customer_id)
          .maybeSingle();

        if (!link?.user_id) return json({ error: "No portal account found for this customer" }, 404);

        const { error: updateErr } = await serviceClient.auth.admin.updateUserById(
          link.user_id,
          { password, email_confirm: true }
        );

        if (updateErr) {
          console.error("set-password: error:", updateErr.message);
          return json({ error: "Password reset failed: " + updateErr.message }, 500);
        }

        if (require_change) {
          await serviceClient
            .from("customer_auth_links")
            .update({ setup_complete: false })
            .eq("customer_id", customer_id);
        }

        return json({ success: true, message: "Password updated successfully." });
      }

      // ===== MANAGER: CHANGE USERNAME =====
      if (path === "manager/portal/change-username" && req.method === "POST") {
        const manager = await verifyManager(req);
        if (!manager) return json({ error: "Manager access required" }, 403);

        const body = await req.json();
        const { customer_id, username } = body;

        if (!customer_id) return json({ error: "Customer ID required" }, 400);
        if (!username?.trim()) return json({ error: "Username is required" }, 400);

        const serviceClient = createServiceClient();

        // Check uniqueness
        const { data: existing } = await serviceClient
          .from("customer_auth_links")
          .select("customer_id")
          .ilike("username", username.trim())
          .maybeSingle();

        if (existing && existing.customer_id !== customer_id) {
          return json({ error: "That username is already taken" }, 409);
        }

        const { error: updateErr } = await serviceClient
          .from("customer_auth_links")
          .update({ username: username.trim().toLowerCase() })
          .eq("customer_id", customer_id);

        if (updateErr) return json({ error: "Unable to update username" }, 500);

        return json({ success: true, message: "Username updated." });
      }

      // ===== PORTAL: RESOLVE USERNAME TO EMAIL (public, no auth) =====
      if (path === "resolve-username" && req.method === "POST") {
        const body = await req.json();
        const username = body?.username?.trim()?.toLowerCase();

        if (!username) return json({ error: "Username required" }, 400);

        const serviceClient = createServiceClient();

        // Find the link by username, then get the customer's email
        const { data: link } = await serviceClient
          .from("customer_auth_links")
          .select("user_id, customer_id, portal_status")
          .ilike("username", username)
          .maybeSingle();

        if (!link) return json({ error: "Username not found" }, 404);
        if (link.portal_status === "disabled") return json({ error: "This account has been disabled. Please contact us." }, 403);

        // Get the auth user's email
        const { data: userData, error: userErr } = await serviceClient.auth.admin.getUserById(link.user_id);
        if (userErr || !userData?.user?.email) {
          console.error("resolve-username: getUserById error for user_id", link.user_id, userErr?.message);
          return json({ error: "Unable to resolve account" }, 500);
        }

        return json({ email: userData.user.email });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("Customer portal error:", err);
      return json({ error: "An error occurred. Please try again." }, 500);
    }
  });
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function createUserClient(token: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyManager(req: Request): Promise<boolean> {
  const managerToken = req.headers.get("X-Manager-Token") || "";
  if (!managerToken) return false;

  const serviceClient = createServiceClient();
  // The manager token is the employee's PIN-based session user ID.
  // We verify they exist and are an active manager.
  // The token format is "employee_id:pin_hash" — but we keep it simple:
  // the internal app sends the employee's session user ID, and we check the employees table.
  // For security, we also accept a service-role key as the manager token.
  if (managerToken === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;

  // Check employees table by ID
  const { data: emp } = await serviceClient
    .from("employees")
    .select("id, role, active")
    .eq("id", managerToken)
    .eq("active", true)
    .maybeSingle();

  return emp?.role === "manager";
}
