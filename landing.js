const siteHome = document.getElementById('siteHome');
const loginScreen = document.getElementById('telaLogin');

document.getElementById('siteYear').textContent = new Date().getFullYear();

document.querySelectorAll('[data-open-login]').forEach(button => {
    button.addEventListener('click', () => {
        siteHome.hidden = true;
        loginScreen.hidden = false;
        loginScreen.style.display = 'flex';
        document.getElementById('loginEmail').focus();
        window.scrollTo({ top: 0, behavior: 'instant' });
    });
});

document.querySelector('[data-open-home]').addEventListener('click', () => {
    loginScreen.hidden = true;
    siteHome.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
});

