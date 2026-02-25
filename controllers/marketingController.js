/**
 * Minimal marketing API: stats and campaign list.
 * Campaign/campaign-stats can be extended with a Marketing or Campaign model later.
 */
async function getStats(req, res) {
  try {
    // Placeholder: no Marketing model yet. Return zeros; client can show "Get started".
    res.json({
      campaigns: 0,
      emailsSent: 0,
      openRate: null,
      templates: 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listCampaigns(req, res) {
  try {
    res.json([]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  getStats,
  listCampaigns,
};
