(() => {
  if (location.hostname !== 'duodangpu.github.io') return;
  const label = document.getElementById('visit-count');
  if (!label) return;
  fetch('https://api.counterapi.dev/v2/xiaomishuais-team-6090/duodangpu-website-views/up', {cache: 'no-store', credentials: 'omit'})
    .then(response => {
      if (!response.ok) throw new Error('Counter unavailable');
      return response.json();
    })
    .then(result => {
      const count = result.data?.up_count;
      if (!Number.isSafeInteger(count) || count < 0) return;
      label.textContent = `· 累计访问 ${count.toLocaleString('zh-CN')} 次`;
      label.hidden = false;
    })
    .catch(() => {});
})();
