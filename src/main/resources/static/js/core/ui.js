export function showToast(message, options = {}) {
  const stack = document.querySelector('#toast-stack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${options.type ?? 'info'}`;
  toast.innerHTML = `
    <span class="toast__mark"></span>
    <div class="toast__content">
      ${options.title ? `<strong>${escapeHtml(options.title)}</strong>` : ''}
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  const duration = options.duration ?? 3400;
  setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 500);
  }, duration);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}
