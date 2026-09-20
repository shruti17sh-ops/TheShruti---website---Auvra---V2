// Auvra Campaign Checker
// Cuelinks V3
//
// Purpose:
// Check whether a retailer has an affiliate campaign
// available to the current Auvra/Cuelinks account.

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const query = String(req.query?.q || "").trim();

  if (!query) {
    return res.status(400).json({
      error: "Campaign search query is required"
    });
  }

  const apiKey = process.env.CUELINKS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Cuelinks API key is not configured"
    });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      per_page: "10"
    });

    const response = await fetch(
      `https://developers.cuelinks.com/pub_api/v3/campaigns?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Cuelinks campaign search failed:",
        data
      );

      return res.status(response.status).json({
        error:
          data?.error ||
          "Unable to search Cuelinks campaigns"
      });
    }

    const campaigns = Array.isArray(data?.data)
      ? data.data
      : [];

    return res.status(200).json({
      success: true,
      query,
      count: campaigns.length,
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        domain: campaign.domain || null,
        access_status:
          campaign.access_status || null,
        epc_7d:
          campaign.epc_7d ?? null,
        epc_90d:
          campaign.epc_90d ?? null,
        tracking_url:
          campaign.tracking_url || null
      }))
    });

  } catch (error) {

    console.error(
      "Auvra campaign checker error:",
      error
    );

    return res.status(502).json({
      error:
        "Campaign service temporarily unavailable"
    });
  }
};
