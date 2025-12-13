// server.js – Flippen Lekka Scan Station backend
// - /pp                 : secure proxy to ParcelPerfect (SWE v28)
// - /shopify/orders/... : minimal Shopify Admin proxy for order lookup

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import cors from "cors";
import helmet from "helmet";
import fetch from "node-fetch";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// ===== Config (env) =====
const {
  PORT = 3000,
  NODE_ENV = "development",
  FRONTEND_ORIGIN = "http://localhost:3000", // adjust for your real origin(s)

  // IMPORTANT: this must be the v28 endpoint, exactly like the working HTML test
  PP_BASE_URL = "/siyweb45531.pperfect.com/ecomService/v28/Json/",//"https://adpdemo.pperfect.com/ecomService/v28/Json/",
  PP_TOKEN = "",//"e13f1c38ddb8e981beddd501939e00124e7e4269",
  PP_REQUIRE_TOKEN=true,
  PP_ACCNUM,
  PP_PLACE_ID,

  SHOPIFY_STORE,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_LOCATION_ID,
  SHOPIFY_API_VERSION = "2024-10",
  TRACKING_COMPANY = "SWE Couriers",
  
  PRINTNODE_API_KEY,
  PRINTNODE_PRINTER_ID
} = process.env;

// ===== Middleware =====
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));

// CORS: allow your SPA / Shopify app proxy origins
const allowedOrigins = new Set(
  FRONTEND_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
app.use(
  cors({
    origin: true,          // reflect any origin
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400
  })
);

app.options("*", (_, res) => res.sendStatus(204));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120, // 120 req/min per IP
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// ===== Helpers =====
function badRequest(res, message, detail) {
  return res.status(400).json({ error: "BAD_REQUEST", message, detail });
}

// ===== 1) ParcelPerfect proxy (v28, POST, form-encoded, token_id) =====
// ===== 1) ParcelPerfect proxy (v28, POST form) =====
app.post("/pp", async (req, res) => {
  try {
    const { method, classVal, params } = req.body || {};

    if (!method || !classVal || typeof params !== "object") {
      return badRequest(res, "Expected { method, classVal, params } in body");
    }

    if (!PP_BASE_URL || !PP_BASE_URL.startsWith("http")) {
      console.error("PP_BASE_URL is invalid:", PP_BASE_URL);
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    // Log what we’re about to send (for debugging)
    console.log("PP proxy calling:", PP_BASE_URL);
    console.log("PP payload:", { method, classVal, params });

    const form = new URLSearchParams();
    form.set("method", String(method));             // e.g. "requestQuote"
    form.set("class", String(classVal));            // e.g. "quote"
    form.set("params", JSON.stringify(params));     // full details+contents

    const mustUseToken = PP_REQUIRE_TOKEN === "true";
    const tokenToUse = mustUseToken ? PP_TOKEN : "";
    if (tokenToUse) {
      form.set("token_id", tokenToUse);            // IMPORTANT: token_id
    }

    const upstream = await fetch(PP_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json; charset=utf-8";
    res.set("content-type", contentType);

    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch {
      return res.status(upstream.status).send(text);
    }
  } catch (err) {
    console.error("PP proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});


// ===== 2) Shopify: find order by name (used by your SPA) =====
app.get("/shopify/orders/by-name/:name", async (req, res) => {
  try {
    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(501).json({
        error: "SHOPIFY_NOT_CONFIGURED",
        message: "Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in .env"
      });
    }

    let name = req.params.name || "";
    if (!name.startsWith("#")) name = `#${name}`;

    const base = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;

    const orderUrl = `${base}/orders.json?status=any&name=${encodeURIComponent(
      name
    )}`;
    const orderResp = await fetch(orderUrl, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      timeout: 20_000
    });

    if (!orderResp.ok) {
      const body = await orderResp.text();
      return res.status(orderResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: orderResp.status,
        statusText: orderResp.statusText,
        body
      });
    }

    const orderData = await orderResp.json();
    const order =
      Array.isArray(orderData.orders) && orderData.orders.length
        ? orderData.orders[0]
        : null;
    if (!order) {
      return res
        .status(404)
        .json({ error: "NOT_FOUND", message: "Order not found" });
    }

    // Customer metafields for place code
    let customerPlaceCode = null;
    try {
      if (order.customer && order.customer.id) {
        const metaUrl = `${base}/customers/${order.customer.id}/metafields.json`;
        const metaResp = await fetch(metaUrl, {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json"
          },
          timeout: 15000
        });

        if (metaResp.ok) {
          const metaData = await metaResp.json();
          const m = (metaData.metafields || []).find(
            (mf) =>
              mf.namespace === "custom" &&
              mf.key === "parcelperfect_place_code"
          );
          if (m && m.value) customerPlaceCode = m.value;
        } else {
          const body = await metaResp.text();
          console.warn(
            "Customer metafields fetch failed:",
            metaResp.status,
            body
          );
        }
      }
    } catch (e) {
      console.warn("Customer metafields error:", e);
    }

    return res.json({ order, customerPlaceCode });
  } catch (err) {
    console.error("Shopify proxy error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2b) Shopify: list open, paid, unfulfilled orders for dispatch board =====
app.get("/shopify/orders/open", async (req, res) => {
  try {
    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(501).json({
        error: "SHOPIFY_NOT_CONFIGURED",
        message: "Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in .env"
      });
    }

    const base = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;

    // Only unfulfilled / in progress, most recent first
    const url =
      `${base}/orders.json?status=any` +
      `&fulfillment_status=unfulfilled,in_progress` +
      `&limit=50&order=created_at+desc`;

    const resp = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      timeout: 20000
    });

    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const ordersRaw = Array.isArray(data.orders) ? data.orders : [];

    const orders = ordersRaw.map(o => {
      const shipping = o.shipping_address || {};
      const customer = o.customer || {};

          // parcel_count_X tag support
    let parcelCountFromTag = null;
    if (typeof o.tags === "string" && o.tags.trim()) {
      const parts = o.tags.split(",").map((t) => t.trim().toLowerCase());
      for (const t of parts) {
        const m = t.match(/^parcel_count_(\d+)$/);
        if (m) {
          parcelCountFromTag = parseInt(m[1], 10);
          break;
        }
      }
    }


      // 👇 This is the important bit: force a customer_name field.
      const customer_name =
        shipping.name ||
        `${(customer.first_name || "").trim()} ${(customer.last_name || "").trim()}`.trim() ||
        // last-resort: try removing leading # from order name
        (o.name ? o.name.replace(/^#/, "") : "");

      return {
        id: o.id,
        name: o.name,                    // e.g. "#253199"
        customer_name,                   // e.g. "Riversdal Superspar"
        created_at: o.processed_at || o.created_at,
        fulfillment_status: o.fulfillment_status,
        shipping_city: shipping.city || "",
        shipping_postal: shipping.zip || "",
        line_items: (o.line_items || []).map(li => ({
          title: li.title,
          quantity: li.quantity
        }))
      };
    });

    return res.json({ orders });
  } catch (err) {
    console.error("Shopify open-orders error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

// ===== ParcelPerfect place lookup (Waybill.getPlace, via same base URL) =====
app.get("/pp/place", async (req, res) => {
  try {
    const query = (req.query.q || req.query.query || "").trim();
    if (!query) {
      return badRequest(res, "Missing ?q= query string for place search");
    }

    if (!PP_BASE_URL || !PP_BASE_URL.startsWith("http")) {
      console.error("PP_BASE_URL is invalid:", PP_BASE_URL);
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    if (!PP_TOKEN) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_TOKEN is required for getPlace"
      });
    }

    const paramsObj = {
      id: PP_PLACE_ID || "ShopifyScanStation",
      accnum: PP_ACCNUM || "",
      ppcust: ""
    };

    const qs = new URLSearchParams();
    qs.set("Class", "Waybill");
    qs.set("method", "getPlace");
    qs.set("token_id", PP_TOKEN);
    qs.set("params", JSON.stringify(paramsObj));
    qs.set("query", query);
    // we do NOT set callback or _dc → we want plain JSON, not JSONP

    const base = PP_BASE_URL.endsWith("/")
      ? PP_BASE_URL
      : PP_BASE_URL + "/";
    const url = `${base}?${qs.toString()}`;

    console.log("PP getPlace →", url);

    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("PP getPlace JSON parse error:", e);
      return res.status(upstream.status).send(text);
    }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("PP getPlace error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});


// ===== 3) PrintNode proxy: receive base64 PDF from frontend and send to PrintNode =====
app.post("/printnode/print", async (req, res) => {
  try {
    const { pdfBase64, title } = req.body || {};

    if (!pdfBase64) {
      return res
        .status(400)
        .json({ error: "BAD_REQUEST", message: "Missing pdfBase64" });
    }

    if (!PRINTNODE_API_KEY || !PRINTNODE_PRINTER_ID) {
      return res.status(500).json({
        error: "PRINTNODE_NOT_CONFIGURED",
        message:
          "Set PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID in your .env file"
      });
    }

    const auth = Buffer.from(PRINTNODE_API_KEY + ":").toString("base64");

    const payload = {
      printerId: Number(PRINTNODE_PRINTER_ID),
      title: title || "Parcel Label",
      contentType: "pdf_base64",
      content: pdfBase64.replace(/\s/g, ""), // strip whitespace/newlines
      source: "Flippen Lekka Scan Station"
    };

    const upstream = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      console.error(
        "PrintNode error:",
        upstream.status,
        upstream.statusText,
        text
      );
      return res.status(upstream.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: upstream.status,
        statusText: upstream.statusText,
        body: data
      });
    }

    // Success
    return res.json({ ok: true, printJob: data });
  } catch (err) {
    console.error("PrintNode proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

// ===== 3) Health check =====
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ===== Shopify fulfillment on booking =====
app.post("/shopify/fulfill", express.json(), async (req, res) => {
  try {
    const {
      orderId,
      lineItems,
      trackingNumber,
      trackingUrl,
      trackingCompany
    } = req.body || {};

    if (!orderId || !trackingNumber) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_FIELDS",
        message: "orderId and trackingNumber are required"
      });
    }

    const apiVersion = SHOPIFY_API_VERSION || "2024-10";
    const url = `https://${SHOPIFY_STORE}/admin/api/${apiVersion}/orders/${orderId}/fulfillments.json`;

    const fulfillmentPayload = {
      fulfillment: {
        // If you don’t want to specify, you can omit location_id entirely
        ...(SHOPIFY_LOCATION_ID
          ? { location_id: Number(SHOPIFY_LOCATION_ID) }
          : {}),
        tracking_company: trackingCompany || TRACKING_COMPANY,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl || undefined,
        notify_customer: true,
        // If you omit line_items, Shopify tries to fulfill all fulfillable items
        ...(Array.isArray(lineItems) && lineItems.length
          ? {
              line_items: lineItems.map((li) => ({
                id: li.id,
                quantity: li.quantity
              }))
            }
          : {})
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fulfillmentPayload),
      timeout: 20000
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    console.log(
      "Shopify fulfill POST",
      url,
      "→",
      resp.status,
      String(text).slice(0, 400)
    );

    if (!resp.ok) {
      return res.status(resp.status).json({
        ok: false,
        status: resp.status,
        error: "SHOPIFY_ERROR",
        detail: data
      });
    }

    return res.json({
      ok: true,
      fulfillment: data.fulfillment || data
    });
  } catch (err) {
    console.error("Fulfill error:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      detail: String(err?.message || err)
    });
  }
});

// ===== 2c) Shopify: customer search for FLOCS (name/email/phone) =====
app.get("/shopify/customers/search", async (req, res) => {
  try {
    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(501).json({
        error: "SHOPIFY_NOT_CONFIGURED",
        message: "Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in .env"
      });
    }

    const q = (req.query.q || "").trim();
    if (!q) {
      return badRequest(res, "Missing ?q= query string for customer search");
    }

    const base = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;
    const url = `${base}/customers/search.json?query=${encodeURIComponent(
      q
    )}&limit=10`;

    const resp = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      timeout: 20000
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const customersRaw = Array.isArray(data.customers) ? data.customers : [];

    // For each customer, pull a single metafield custom.delivery_method if present
    const customers = [];
    for (const c of customersRaw) {
      let deliveryMethod = null;
      try {
        if (c.id) {
          const metaUrl = `${base}/customers/${c.id}/metafields.json`;
          const metaResp = await fetch(metaUrl, {
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
              "Content-Type": "application/json",
              Accept: "application/json"
            },
            timeout: 15000
          });
          if (metaResp.ok) {
            const metaData = await metaResp.json();
            const mf = (metaData.metafields || []).find(
              (m) =>
                m.namespace === "custom" && m.key === "delivery_method"
            );
            if (mf && mf.value) {
              deliveryMethod = String(mf.value).toLowerCase(); // "ship" | "pickup" | "deliver"
            }
          }
        }
      } catch (e) {
        console.warn("Customer metafields fetch (delivery_method) failed:", e);
      }

      const name =
        `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
        c.company ||
        c.email ||
        String(c.id);

      customers.push({
        id: c.id,
        name,
        email: c.email || "",
        phone: c.phone || "",
        delivery_method: deliveryMethod,
        default_address: c.default_address || null,
        addresses: Array.isArray(c.addresses) ? c.addresses : []
      });
    }

    return res.json({ customers });
  } catch (err) {
    console.error("Shopify customer search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});


// ===== 2d) Shopify: create draft order for FLOCS =====
app.post("/shopify/draft-orders", async (req, res) => {
  try {
    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(501).json({
        error: "SHOPIFY_NOT_CONFIGURED",
        message: "Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in .env"
      });
    }

    const {
      customerId,
      shippingAddress,
      billingAddress,
      shippingMethod,   // "ship" | "pickup" | "deliver"
      poNumber,
      lineItems,        // [{ variantId, quantity, sku, title, price }]
      shippingPrice,    // number
      shippingService   // e.g. "ECO" | "RFX"
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId", req.body);
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "No lineItems supplied", req.body);
    }

    const base = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;
    const url = `${base}/draft_orders.json`;

    const normalizedLineItems = lineItems.map((li) => ({
      variant_id: li.variantId,               // required; configure on frontend
      quantity: li.quantity || 1,
      sku: li.sku || undefined,
      title: li.title || undefined,
      // price is optional; if omitted Shopify uses product price
      ...(li.price != null
        ? { price: Number(li.price).toFixed(2) }
        : {})
    }));

    const metafields = [];
    if (poNumber) {
      metafields.push({
        namespace: "flocs",
        key: "po_number",
        type: "single_line_text_field",
        value: String(poNumber)
      });
    }
    if (shippingMethod) {
      metafields.push({
        namespace: "flocs",
        key: "delivery_method",
        type: "single_line_text_field",
        value: String(shippingMethod)
      });
    }

    const shipping_line =
      shippingMethod === "ship" && shippingPrice != null
        ? {
            title: shippingService
              ? `Courier – ${shippingService}`
              : "Courier shipping",
            price: Number(shippingPrice).toFixed(2)
          }
        : undefined;

    const draftPayload = {
      draft_order: {
        customer: { id: customerId },
        line_items: normalizedLineItems,
        note: poNumber ? `PO: ${poNumber}` : undefined,
        tags: ["FLOCS"],
        shipping_line,
        billing_address: billingAddress || undefined,
        shipping_address:
          shippingMethod === "ship" ? shippingAddress || undefined : undefined,
        metafields
      }
    };

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(draftPayload),
      timeout: 20000
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      console.error("Draft order error:", upstream.status, text.slice(0, 400));
      return res.status(upstream.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: upstream.status,
        statusText: upstream.statusText,
        body: data
      });
    }

    const draft = data.draft_order || data;
    const adminUrl = draft && draft.id
      ? `https://${SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${draft.id}`
      : null;

    return res.json({
      ok: true,
      draftOrder: {
        id: draft.id,
        name: draft.name,
        invoiceUrl: draft.invoice_url || null,
        adminUrl,
        subtotalPrice: draft.subtotal_price,
        totalPrice: draft.total_price
      }
    });
  } catch (err) {
    console.error("Draft order create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});


// Serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));
// near the other static / fallback routes
app.get("/flops", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "flops.html"));
});

app.get("/flocs", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "flocs.html"));
});

// SPA fallback – send index.html for any unknown GET
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== Start =====
app.listen(PORT, () => {
  console.log(`Scan Station server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${[...allowedOrigins].join(", ")}`);
  console.log("PP_BASE_URL:", PP_BASE_URL || "(NOT SET)");
});
