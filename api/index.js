// stripe-backend.js - Node.js/Express backend for Stripe integration
// This file shows how to set up the backend for your live Stripe test

require('dotenv').config(); // Add this line
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Use env variable
const app = express();

app.use(express.json());
app.use(express.static('../')); // point to parent directory
// Create Checkout Session endpoint
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    console.log('Received items:', items); // Add logging
    console.log('Stripe key exists:', !!process.env.STRIPE_SECRET_KEY); // Check if key exists
    
    // Convert your cart items to Stripe line items
    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.description || '',
        },
        unit_amount: item.price * 100, // Stripe expects amounts in cents
      },
      quantity: item.quantity || 1,
    }));

    // Create the session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/index.html`,
      
      // Collect customer information
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      
      // Add metadata for your records
      metadata: {
        order_id: 'VT-' + Date.now().toString().slice(-8),
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve session details for the success page
app.get('/api/order/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.params.sessionId,
      {
        expand: ['line_items', 'customer'],
      }
    );

    // Format the data for your invoice
    const orderData = {
      orderNumber: session.metadata.order_id,
      invoiceNumber: 'INV-' + Date.now().toString().slice(-8),
      customerName: session.customer_details.name,
      customerEmail: session.customer_details.email,
      customerAddress: formatAddress(session.customer_details.address),
      items: session.line_items.data.map(item => ({
        name: item.description,
        description: '',
        quantity: item.quantity,
        price: item.amount_total / 100,
      })),
      subtotal: session.amount_subtotal / 100,
      tax: session.total_details.amount_tax / 100,
      shipping: session.total_details.amount_shipping / 100,
      total: session.amount_total / 100,
      paymentStatus: session.payment_status,
      sessionId: session.id,
    };

    res.json(orderData);
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Store invoice endpoint
app.post('/api/invoices', async (req, res) => {
  try {
    const invoiceData = req.body;
    
    // In production, save to your database
    // await db.invoices.create(invoiceData);
    
    // For demo, we'll just log it
    console.log('Storing invoice:', invoiceData);
    
    // You could also:
    // - Send confirmation email with SendGrid
    // - Store in Google Sheets
    // - Save to Airtable
    // - Store in Firebase
    
    res.json({ success: true, invoiceId: invoiceData.invoiceNumber });
  } catch (error) {
    console.error('Error storing invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint to handle Stripe events
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'whsec_YOUR_WEBHOOK_SECRET'; // From Stripe Dashboard

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('Payment successful:', session.id);
        // Fulfill the order, send emails, etc.
        break;
      
      case 'payment_intent.payment_failed':
        console.log('Payment failed:', event.data.object.id);
        // Handle failed payment
        break;
    }

    res.json({received: true});
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

function formatAddress(address) {
  return `${address.line1}${address.line2 ? ', ' + address.line2 : ''}, ${address.city}, ${address.state} ${address.postal_code}, ${address.country}`;
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Server is running!',
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    domain: process.env.DOMAIN
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to test`);
});

// ===== SETUP INSTRUCTIONS =====
/*
1. Install dependencies:
   npm init -y
   npm install express stripe

2. Set up environment variables:
   Create a .env file:
   STRIPE_SECRET_KEY=sk_test_your_key_here
   DOMAIN=http://localhost:3000

3. Update your HTML checkout function:
   async function checkout() {
     const response = await fetch('/create-checkout-session', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ items: cart })
     });
     const { url } = await response.json();
     window.location.href = url; // Redirect to Stripe Checkout
   }

4. Update success.html to fetch real data:
   async function generateInvoice() {
     const response = await fetch(`/api/order/${sessionId}`);
     const orderData = await response.json();
     displayInvoice(orderData);
     storeInvoice(orderData);
   }

5. Set up Stripe webhook (for production):
   - Go to Stripe Dashboard > Webhooks
   - Add endpoint: https://yourdomain.com/webhook
   - Select events: checkout.session.completed
   - Copy the signing secret to endpointSecret

6. For production deployment:
   - Use environment variables for all keys
   - Enable HTTPS (required for webhooks)
   - Add proper error handling
   - Implement database storage
*/