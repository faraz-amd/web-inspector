document.getElementById('runAudit').addEventListener('click', async () => {
  const url = document.getElementById('url').value;
  const result = document.getElementById('result');
  result.textContent = 'Running audit...';

  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    result.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    result.textContent = 'Error: ' + err.message;
  }
});
