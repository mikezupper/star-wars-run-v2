class LazyLoadComponent extends HTMLElement {
    constructor() {
        super();
        this.entityId;
        this.entityType;
        this.attachShadow({
            mode: 'open'
        });
        this.shadowRoot.innerHTML = `
        <div id="component" class="web-component">
             <div id="info" ></div>
        </div>
    `;
    }
    static get observedAttributes() {
        return ["entity-id","entity-type"];
    }
    attributeChangedCallback(name, oldValue, newValue) {
        // this will fire initially as the element has no atrribute but is added when page runs
        console.log("attribute has changed")
        if (oldValue === newValue) {
            return;
        }
        if (name === "entity-id") {
            console.log(name, oldValue, newValue);
            this.entityId = newValue;
        }if (name === "entity-type") {
            console.log(name, oldValue, newValue);
            this.entityType = newValue;
        }
    }
    connectedCallback() {

        const lazyComponent = this.shadowRoot.querySelector('#component');

        let callback = (entries, observer) => { // Intersection Observer API
            entries.forEach(entry => {
                if (entry.isIntersecting) { // Intersection Observer API
                    // START Usual fetch and display
                    console.log("loading...");
                    let apiUrl = `https://api.starwars.run/api/${this.entityType}/${this.entityId}`;

                    console.log("Making AJAX to: " + apiUrl);
                    fetch(apiUrl)
                        .then(res => res.json())
                        .then(data => {
                            console.log(data);
                            let output = '<br>';
                            const info = this.shadowRoot.querySelector('#info');
                            info.innerHTML = '';
                            console.log("Loading Lazy Entity");
                            output += `<card-detail detail-name="${data.name}"></card-detail>`;
                            output += 'name: <b>' + data.name + '</b>';
                            output += '</div>';
                            info.innerHTML += output;
                        });
                    // END Usual fetch and display
                    observer.unobserve(entry.target); // Intersection Observer API
                }
            });
        }
        let options = {
            // root: null,
            // threshold: 1.0,
            // rootMargin: '0px'
            root: null,
            rootMargin: "0px 0px -175px 0px", // 400px above the fold for demo purpses
            threshold: 0.0 // what percentage of object must be in view to activate it.
        }
        // Create instance of Intersection Observer with options
        let observer = new IntersectionObserver(callback, options);
        observer.observe(lazyComponent); // Initiate observer
    }
    disconnectedCallback() {}
}
customElements.define('lazy-load-component', LazyLoadComponent);