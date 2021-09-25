class SwCard extends HTMLElement {
	constructor() {
		super();
		this.ID;
		this.attachShadow({
			mode: 'open',
		});
		this.shadowRoot.innerHTML = `
        <div id="card"></div>
    `;
	}
	static get observedAttributes() {
		return ['card-id'];
	}
	attributeChangedCallback(name, oldValue, newValue) {
		// this will fire initially as the element has no atrribute but is added when page runs
		console.log('attribute has changed');
		if (oldValue === newValue) {
			return;
		}
		if (name === 'card-id') {
			console.log(name, oldValue, newValue);
			this.ID = newValue;
			this._getCard(this.ID);
		}
	}

	connectedCallback() {
		// When component is added to DOM
		console.log('connectedCallback...!!!!!!');
	}

	disconnectedCallback() {
		// when component is removed from DOM
		console.log('disconnectedCallback...');
	}

	_getCard(cardId) {
		let url = 'https://jsonplaceholder.typicode.com/posts/' + cardId;
		console.log('[URL] ' + url);

		fetch(url)
			.then((res) => res.json())
			.then((data) => {
				console.log(data);

				let i;
				let output = '<br>';
				const info = this.shadowRoot.querySelector('#card');
				info.innerHTML = '<h3>URL: ' + url + '</h3>';
				console.log('Loading Lazy Post');
				output += '<div class="card">';
				output += 'PostID: <b>' + data.id + '</b><br> Title: <b>' + data.title + '</b><br> Author: ';
				output += '<b>' + data.userId + '</b><br>';
				output += '<p>' + data.body + '</p>';
				output += '</div>';

				info.innerHTML += output;
			});
	}
}

customElements.define('sw-card', SwCard);
