// Auvra Monetization Router
// V3 architecture
//
// Priority:
// 1. Monetized affiliate route
// 2. Future alternative affiliate networks
// 3. Direct retailer fallback
//
// IMPORTANT:
// Never treat a Cuelinks tracking_url as monetized unless
// Cuelinks explicitly returns affiliated === true.

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const originalUrl = String(req.query?.url || "").trim();

  if (!originalUrl) {
    return res.status(400).json({
      error: "Retailer URL is required"
    });
  }

  // Basic URL validation
  let retailerUrl;

  try {
    retailerUrl = new URL(originalUrl);
  } catch {
    return res.status(400).json({
      error: "Invalid retailer URL"
    });
  }

  // Only allow normal web URLs.
  if (!["http:", "https:"].includes(retailerUrl.protocol)) {
    return res.status(400).json({
      error: "Unsupported retailer URL"
    });
  }

  const apiKey = process.env.CUELINKS_API_KEY;

  /*
   * ---------------------------------------------------------
   * 1. TRY CUELINKS
   * ---------------------------------------------------------
   */

  if (apiKey) {
    try {
      const response = await fetch(
        "https://developers.cuelinks.com/pub_api/v3/links/convert",
        {
          method: "POST",
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: originalUrl
          })
        }
      );

      const data = await response.json();

      if (response.ok && data?.data) {
        const result = data.data;

        /*
         * CRITICAL:
         *
         * tracking_url can exist even when affiliated=false.
         *
         * Therefore:
         *
         * affiliated=true
         *     → monetized Cuelinks route
         *
         * affiliated=false
         *     → DO NOT use Cuelinks tracking URL
         */

        if (result.affiliated === true && result.tracking_url) {
          return res.status(200).json({
            success: true,
            destination: "affiliate",
            network: "cuelinks",
            affiliated: true,
            tracking_url: result.tracking_url,
            original_url: originalUrl,
            campaign: result.campaign || null
          });
        }

        /*
         * Cuelinks knows about the URL, but Auvra
         * cannot currently earn commission from it.
         */

        return res.status(200).json({
          success: true,
          destination: "retailer",
          network: "cuelinks",
          affiliated: false,
          tracking_url: null,
          original_url: originalUrl,
          campaign: result.campaign || null
        });
      }

      /*
       * Cuelinks responded with an error.
       *
       * Do NOT break the customer's shopping journey.
       */

      console.warn(
        "Cuelinks conversion unavailable:",
        data?.error || response.status
      );

    } catch (error) {
      console.warn(
        "Cuelinks request failed:",
        error?.message || error
      );
    }
  } else {
    console.warn("CUELINKS_API_KEY is not configured.");
  }

  /*
   * ---------------------------------------------------------
   * 2. FUTURE NETWORK ROUTES
   * ---------------------------------------------------------
   *
   * Amazon / Flipkart / other affiliate networks will be
   * plugged into this section later.
   *
   * Example future architecture:
   *
   * const amazonResult = await tryAmazon(...)
   *
   * if (amazonResult.affiliated) {
   *   return res.status(200).json(amazonResult);
   * }
   */

  /*
   * ---------------------------------------------------------
   * 3. DIRECT RETAILER
   * ---------------------------------------------------------
   *
   * No monetized route currently available.
   *
   * Preserve the user's shopping journey.
   */

  return res.status(200).json({
    success: true,
    destination: "retailer",
    network: null,
    affiliated: false,
    tracking_url: null,
    original_url: originalUrl,
    campaign: null
  });
};
