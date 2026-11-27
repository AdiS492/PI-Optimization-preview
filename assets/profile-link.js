(function () {
  function addProfileLink() {
    document.querySelectorAll('.account-dropdown').forEach(function (menu) {
      if (menu.querySelector('[data-profile-link]')) return;
      var link = document.createElement('a');
      link.href = 'profile.html';
      link.className = 'account-menu-item';
      link.dataset.profileLink = '';
      link.setAttribute('role', 'menuitem');
      link.innerHTML = '<span aria-hidden="true" style="font-size:20px;width:24px;text-align:center">&#9673;</span> Profile &amp; switch account';
      menu.prepend(link);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addProfileLink); else addProfileLink();
})();
