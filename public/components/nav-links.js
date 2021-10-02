const navLinksTemplate = document.createElement("template");
navLinksTemplate.innerHTML = `
<nav clas="navbar">
    <div id="navbarMenu" class="navbar-menu">
        <div class="navbar-end">
            <a class="navbar-item">
                People
            </a>
            <a class="navbar-item">
                Planets
            </a>
            <a class="navbar-item">
                Vehicles
            </a>
            <a class="navbar-item">
                Starships
            </a>
            <a class="navbar-item">
                Species
            </a>
        </div>
    </div>
</nav>
`;
class NavLinks extends HTMLElement {
  constructor() {
    super();

    //const shadowRoot = this.attachShadow({ mode: "open" });
    this.appendChild(navLinksTemplate.content.cloneNode(true)); // true means deep clone
  }

  connectedCallback() {
    //monitor the search input for neew events to fire off
    const links = document.querySelectorAll(".navbar-item");
    links.forEach((link) => {
      link.onclick = (e) => {
        const entityType = e.target?.textContent?.toLowerCase()?.trim();
        this.dispatchEvent(
          new CustomEvent("NavLinkClicked", {
            detail: {
              entityType,
            },
            bubbles: true,
            composed: true,
          })
        );
      };
      return link.textContent.toLowerCase().trim();
    });
  }
}

customElements.define("nav-links", NavLinks);
