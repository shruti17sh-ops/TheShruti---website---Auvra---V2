module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const url = req.query?.url;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({error:'Valid merchant URL is required'});
  const key = process.env.CUELINKS_API_KEY;
  if (!key) return res.status(503).json({error:'Affiliate backend is not configured'});
  try {
    const r = await fetch('https://developers.cuelinks.com/pub_api/v3/links/convert', {
      method:'POST', headers:{Authorization:`Token ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({url,shorten:false,subid:'auvra_web',subid2:'mobile'})
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({error:d?.error || 'Cuelinks request failed'});
    const x=d?.data||{};
    return res.status(200).json({tracking_url:x.tracking_url||null,affiliated:!!x.affiliated,campaign:x.campaign||null,original_url:x.original_url||url});
  } catch(e){ return res.status(500).json({error:'Affiliate conversion failed'}); }
};
