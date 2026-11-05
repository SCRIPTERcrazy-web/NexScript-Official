export default function handler(req, res) {
  return res.status(200).json({ 
    ok: true, 
    message: 'Guard is alive',
    time: new Date().toISOString()
  });
}
