# Auvra v2 — Real Affiliate MVP

This version adds a real server-side affiliate-link conversion layer using Cuelinks. The frontend never contains the Cuelinks API key.

## What works
- Mobile-first Auvra UI
- Search, categories, sorting
- Wishlist
- Compare / retailer options
- Amazon, Flipkart and Myntra destination URLs
- `/api/affiliate` securely converts a merchant URL to a Cuelinks tracking URL when configured

## What you must connect
1. Create/activate your Cuelinks publisher account and API key.
2. Add `CUELINKS_API_KEY` to Vercel Environment Variables.
3. Deploy this project to Vercel.
4. Test a Buy option.

## Important
The displayed prices are sample comparison data, not live retailer prices. Live price feeds require approved retailer/network data access and should be added in the next phase.

## GitHub Pages option
GitHub Pages cannot execute the `/api/affiliate.js` server function. You can keep the frontend on GitHub Pages and deploy only the API to Vercel; then set `API_BASE` in `public/index.html` to the Vercel backend URL.

Never put your Cuelinks API key in `index.html`.
