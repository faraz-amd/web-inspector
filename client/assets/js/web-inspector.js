// Web Inspector Integration
document.addEventListener('DOMContentLoaded', function() {
    // Create and append the Web Inspector UI
    const inspectorUI = `
        <div id="web-inspector" class="web-inspector-container">
            <button id="toggle-inspector" class="inspector-toggle">
                🔍 Web Inspector
            </button>
            <div id="inspector-panel" class="inspector-panel">
                <div class="inspector-header">
                    <h3>Web Inspector</h3>
                    <input type="url" id="inspect-url" placeholder="Enter URL to inspect" 
                           value="${window.location.href}">
                </div>
                <div class="inspector-results">
                    <pre id="audit-result"></pre>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', inspectorUI);

    // Add event listeners
    const toggleBtn = document.getElementById('toggle-inspector');
    const panel = document.getElementById('inspector-panel');
    const urlInput = document.getElementById('inspect-url');

    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('show');
    });

    async function runInspection(url) {
        const resultDisplay = document.getElementById('audit-result');
        try {
            resultDisplay.innerHTML = 'Running inspection...';
            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });
            
            if (!response.ok) throw new Error('Inspection failed');
            
            const result = await response.json();
            resultDisplay.innerHTML = JSON.stringify(result, null, 2);
        } catch (error) {
            resultDisplay.innerHTML = `Error: ${error.message}`;
        }
    }

    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            runInspection(urlInput.value);
        }
    });

    // Run initial inspection
    runInspection(window.location.href);
});
