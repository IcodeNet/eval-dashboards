/**
 * Adds a "Copy" button to every code block in the docs. Plain script, no dependencies.
 * The button copies the block's text exactly as shown, so a reader can paste it into a terminal.
 */
(() => {
  const LABEL = 'Copy';
  const DONE = 'Copied';
  const FAILED = 'Press Ctrl+C';

  const textOf = (pre) => (pre.querySelector('code') ?? pre).textContent.replace(/\n$/, '');

  /** Clipboard API where the page is secure, else a hidden textarea and execCommand. */
  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy command was refused');
  };

  const attach = (pre) => {
    if (pre.parentElement?.classList.contains('code-block')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    wrapper.append(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = LABEL;
    button.setAttribute('aria-label', 'Copy this code to the clipboard');
    let timer;
    button.addEventListener('click', async () => {
      clearTimeout(timer);
      try {
        await copyText(textOf(pre));
        button.textContent = DONE;
        button.dataset.state = 'done';
      } catch {
        button.textContent = FAILED;
        button.dataset.state = 'failed';
      }
      timer = setTimeout(() => {
        button.textContent = LABEL;
        delete button.dataset.state;
      }, 2000);
    });
    wrapper.append(button);
  };

  document.querySelectorAll('.docs-main pre').forEach(attach);
})();
