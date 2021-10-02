const footerLinksTemplate = document.createElement("template");
footerLinksTemplate.innerHTML = `
<footer class="footer">
        <div class="content has-text-centered">
            <div class="soc">
                <a href="#"><i class="fa fa-github-alt fa-lg" aria-hidden="true"></i></a>
                <a href="#"><i class="fa fa-youtube fa-lg" aria-hidden="true"></i></a>
                <a href="#"><i class="fa fa-facebook fa-lg" aria-hidden="true"></i></a>
                <a href="#"><i class="fa fa-twitter fa-lg" aria-hidden="true"></i></a>
            </div>
        </div>
</footer>
`;

class FooterLinks extends HTMLElement {
  constructor() {
    super();

    // const shadowRoot = this.attachShadow({ mode: "open" });
    this.appendChild(footerLinksTemplate.content.cloneNode(true)); // true means deep clone
  }
}

customElements.define("footer-links", FooterLinks);
