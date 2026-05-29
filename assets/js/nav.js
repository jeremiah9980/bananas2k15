
const NAV_HTML = `
<nav>
  <div class="nav-inner">
    <a class="nav-brand" href="/bananas2k15/index.html">
      <img src="/bananas2k15/assets/logo.jpg" alt="Bananas 2K15 logo">
      Bananas 2K15 <span>SELECT SOFTBALL</span>
    </a>
    <div class="nav-links">
      <a href="/bananas2k15/index.html">Home</a>
      <a href="/bananas2k15/about.html">About</a>
      <a href="/bananas2k15/board.html">Board</a>
      <a href="/bananas2k15/coaching.html">Coaching</a>
      <a href="/bananas2k15/bylaws.html">Bylaws</a>
      <a href="/bananas2k15/docs.html">Documents</a>
      <a href="/bananas2k15/fundraising.html">Support Us</a>
      <a href="/bananas2k15/contact.html">Contact</a>
    </div>
  </div>
</nav>`;

document.addEventListener('DOMContentLoaded', () => {
  document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (path.endsWith(a.getAttribute('href').split('/').pop())) {
      a.classList.add('active');
    }
  });
});
