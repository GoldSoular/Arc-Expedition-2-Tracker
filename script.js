class ExpeditionTracker {
    constructor() {
        // Load saved expedition preference first
        this.currentExpedition = this.loadLastUsedExpedition();
        this.expeditionData = {}; // Store data for both expeditions
        this.currentProject = null;
        this.currentPhaseIndex = 0;
        this.selectedResource = null;
        this.selectedResourceType = null;
        this.currentAmount = 0;
        this.originalRequired = 0;
        this.alreadyCollected = 0;
        this.remainingAmount = 0;
        this.selectedItemElement = null;
        
        this.contextMenuTarget = null;
        this.contextMenuResourceId = null;
        this.contextMenuResourceType = null;
        this.contextMenuRequired = 0;
        
        this.progressData = this.loadProgress();
        
        this.init();
    }

    async init() {
        // Load both expedition data
        await this.loadExpeditionData();
        
        // Set initial project (first and only project in the array)
        const expeditionProjects = this.expeditionData[this.currentExpedition];
        if (expeditionProjects && expeditionProjects.length > 0) {
            this.currentProject = expeditionProjects[0];
        } else {
            // Fallback to expedition 1 if current expedition has no data
            console.warn(`No data for expedition ${this.currentExpedition}, falling back to expedition 1`);
            this.currentExpedition = '1';
            this.saveLastUsedExpedition();
            this.currentProject = this.expeditionData['1'][0];
        }
        
        this.setupEventListeners();
        this.setupExpeditionToggle();
        this.setupKeyboardListeners();
        this.setupContextMenu();
        this.resetCommitCard();
        
        this.renderProgressIndicators();
        this.renderProjectInfo();
        this.renderResourceList();
        this.navigateToEarliestIncompletePhase();
    }

    async loadExpeditionData() {
        try {
            // Load data for both expeditions
            const [data1, data2] = await Promise.all([
                fetch('expedition-1.json').then(r => r.json()),
                fetch('expedition-2.json').then(r => r.json())
            ]);
            
            this.expeditionData['1'] = data1;
            this.expeditionData['2'] = data2;
        } catch (error) {
            console.error('Error loading expedition data:', error);
            // Fallback to existing PROJECTS_DATA if available
            if (typeof PROJECTS_DATA !== 'undefined') {
                this.expeditionData['1'] = PROJECTS_DATA;
                this.expeditionData['2'] = PROJECTS_DATA; // Use same data as fallback
            } else {
                // If no data is available, use empty structure
                console.error('No expedition data available. Please ensure expedition-1.json and expedition-2.json exist.');
                this.expeditionData['1'] = [];
                this.expeditionData['2'] = [];
            }
        }
    }

    loadLastUsedExpedition() {
        try {
            const saved = localStorage.getItem('arcRaidersLastExpedition');
            // Validate that the saved value is either '1' or '2'
            if (saved === '1' || saved === '2') {
                return saved;
            }
        } catch (error) {
            console.error('Error loading last used expedition:', error);
        }
        // Default to expedition 1
        return '1';
    }

    saveLastUsedExpedition() {
        try {
            localStorage.setItem('arcRaidersLastExpedition', this.currentExpedition);
        } catch (error) {
            console.error('Error saving last used expedition:', error);
        }
    }

    setupExpeditionToggle() {
        const buttons = document.querySelectorAll('.expedition-toggle-btn');
        buttons.forEach(button => {
            // Set initial active state based on current expedition
            if (button.dataset.expedition === this.currentExpedition) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            
            button.addEventListener('click', (e) => {
                const expedition = e.target.dataset.expedition;
                this.switchExpedition(expedition);
            });
        });
    }

    switchExpedition(expeditionNumber) {
        if (this.currentExpedition === expeditionNumber) return;
        
        // Save the new expedition preference
        this.currentExpedition = expeditionNumber;
        this.saveLastUsedExpedition();
        
        // Update UI
        document.querySelectorAll('.expedition-toggle-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-expedition="${expeditionNumber}"]`).classList.add('active');
        
        // Get the project for the new expedition
        const expeditionProjects = this.expeditionData[expeditionNumber];
        if (expeditionProjects && expeditionProjects.length > 0) {
            this.currentProject = expeditionProjects[0];
        } else {
            console.error(`No data found for expedition ${expeditionNumber}`);
            return;
        }
        
        // Reset phase index
        this.currentPhaseIndex = 0;
        
        // Clear any selections
        this.resetCommitCard();
        
        // Re-render everything
        this.renderProgressIndicators();
        this.renderProjectInfo();
        this.renderResourceList();
        this.navigateToEarliestIncompletePhase();
    }

    // Update the progress key to include expedition
    loadProgress() {
        const saved = localStorage.getItem('arcRaidersProgress');
        const base = saved ? JSON.parse(saved) : {
            expeditions: {},
            lastUpdated: new Date().toISOString()
        };
        
        // Ensure expeditions structure exists
        if (!base.expeditions) {
            base.expeditions = {};
        }
        
        return base;
    }

    saveProgress() {
        this.progressData.lastUpdated = new Date().toISOString();
        localStorage.setItem('arcRaidersProgress', JSON.stringify(this.progressData));
    }

    getPhaseProgress() {
        const expeditionKey = `expedition_${this.currentExpedition}`;
        const phase = this.currentProject.phases[this.currentPhaseIndex];
        const phaseKey = `phase_${phase.phase}`;
        
        // Initialize expedition if it doesn't exist
        if (!this.progressData.expeditions[expeditionKey]) {
            this.progressData.expeditions[expeditionKey] = {};
        }
        
        // Initialize phase if it doesn't exist
        if (!this.progressData.expeditions[expeditionKey][phaseKey]) {
            this.progressData.expeditions[expeditionKey][phaseKey] = { items: {}, categories: {} };
        }
        
        return this.progressData.expeditions[expeditionKey][phaseKey];
    }

    getPhaseProgressForPhase(phaseNumber) {
        const expeditionKey = `expedition_${this.currentExpedition}`;
        const phaseKey = `phase_${phaseNumber}`;
        
        if (this.progressData.expeditions[expeditionKey] && 
            this.progressData.expeditions[expeditionKey][phaseKey]) {
            return this.progressData.expeditions[expeditionKey][phaseKey];
        }
        return { items: {}, categories: {} };
    }

    navigateToEarliestIncompletePhase() {
        // Check each phase in order (1-6)
        for (let i = 0; i < this.currentProject.phases.length; i++) {
            const phase = this.currentProject.phases[i];
            
            // If this phase is not completed
            if (!this.isPhaseCompleted(phase.phase)) {
                // Navigate to this phase
                if (this.currentPhaseIndex !== i) {
                    this.currentPhaseIndex = i;
                    this.renderProgressIndicators();
                    this.renderProjectInfo();
                    this.renderResourceList();
                    this.resetCommitCard();
                }
                return; // Stop at first incomplete phase
            }
        }
        
        // If all phases are completed, stay on the last phase
        this.currentPhaseIndex = this.currentProject.phases.length - 1;
        this.renderProgressIndicators();
        this.renderProjectInfo();
        this.renderResourceList();
        this.resetCommitCard();
    }

    isPhaseCompleted(phaseNumber) {
        const phase = this.currentProject.phases.find(p => p.phase === phaseNumber);
        if (!phase) return false;
        
        const progress = this.getPhaseProgressForPhase(phaseNumber);
        
        if (phase.requirementItemIds) {
            for (const req of phase.requirementItemIds) {
                const collected = progress.items[req.itemId] || 0;
                if (collected < req.quantity) return false;
            }
        }
        
        if (phase.requirementCategories) {
            for (const cat of phase.requirementCategories) {
                const collected = progress.categories[cat.category] || 0;
                if (collected < cat.valueRequired) return false;
            }
        }
        
        return true;
    }

    setupEventListeners() {
        const amountDisplay = document.getElementById('amountDisplay');
        if (amountDisplay) {
            amountDisplay.addEventListener('input', (e) => {
                const text = e.target.textContent.replace(/\D/g, '');
                const val = parseInt(text) || 0;
                this.currentAmount = Math.min(Math.max(0, val), this.remainingAmount);
                e.target.textContent = this.currentAmount.toString();
                document.getElementById('amountInput').value = this.currentAmount;
                this.moveCaretToEnd(e.target);
                this.updateCommitProgress();
                this.updateControlButtons();
            });
            
            amountDisplay.addEventListener('focus', (e) => {
                setTimeout(() => this.selectAllText(e.target), 10);
            });
            
            amountDisplay.addEventListener('keydown', (e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Delete', 'Backspace'].includes(e.key)) return;
                if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
                if (!/[0-9]/.test(e.key)) e.preventDefault();
            });
            
            amountDisplay.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text').replace(/\D/g, '');
                document.execCommand('insertText', false, text);
            });
            
            amountDisplay.addEventListener('click', (e) => {
                setTimeout(() => this.moveCaretToEnd(e.target), 10);
            });
        }
        
        document.querySelector('.plus-button')?.addEventListener('click', () => {
            if (this.selectedResource && this.currentAmount < this.remainingAmount) this.incrementAmount();
        });
        
        document.querySelector('.minus-button')?.addEventListener('click', () => {
            if (this.currentAmount > 0) this.decrementAmount();
        });
    }

    setupContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        
        document.addEventListener('contextmenu', (e) => {
            const resourceItem = e.target.closest('.resource-item, .category-item');
            if (resourceItem) {
                e.preventDefault();
                this.contextMenuTarget = resourceItem;
                
                if (resourceItem.classList.contains('resource-item')) {
                    const nameElement = resourceItem.querySelector('.resource-name');
                    if (nameElement) {
                        const resourceName = nameElement.textContent;
                        const phase = this.currentProject.phases[this.currentPhaseIndex];
                        
                        if (resourceItem.classList.contains('category-item')) {
                            const cat = phase.requirementCategories?.find(cat => cat.category === resourceName);
                            if (cat) {
                                this.contextMenuResourceId = cat.category;
                                this.contextMenuResourceType = 'category';
                                this.contextMenuRequired = cat.valueRequired;
                            }
                        } else {
                            const req = phase.requirementItemIds?.find(req => formatItemName(req.itemId) === resourceName);
                            if (req) {
                                this.contextMenuResourceId = req.itemId;
                                this.contextMenuResourceType = 'item';
                                this.contextMenuRequired = req.quantity;
                            }
                        }
                    }
                } else if (resourceItem.classList.contains('category-item')) {
                    const nameElement = resourceItem.querySelector('.category-name');
                    if (nameElement) {
                        const categoryName = nameElement.textContent;
                        const phase = this.currentProject.phases[this.currentPhaseIndex];
                        const cat = phase.requirementCategories?.find(cat => cat.category === categoryName);
                        if (cat) {
                            this.contextMenuResourceId = cat.category;
                            this.contextMenuResourceType = 'category';
                            this.contextMenuRequired = cat.valueRequired;
                        }
                    }
                }
                
                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.style.display = 'block';
                
                setTimeout(() => document.addEventListener('click', this.handleClickOutside.bind(this)), 10);
                return false;
            }
        });
        
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleContextMenuAction(e.target.dataset.action);
                this.hideContextMenu();
            });
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideContextMenu();
        });
    }

    handleClickOutside(e) {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu && !contextMenu.contains(e.target)) this.hideContextMenu();
    }

    hideContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu) contextMenu.style.display = 'none';
        document.removeEventListener('click', this.handleClickOutside.bind(this));
        this.contextMenuTarget = null;
        this.contextMenuResourceId = null;
        this.contextMenuResourceType = null;
        this.contextMenuRequired = 0;
    }

    handleContextMenuAction(action) {
        if (!this.contextMenuResourceId || !this.contextMenuResourceType) return;
        
        const progress = this.getPhaseProgress();
        
        if (action === 'set-to-zero') {
            if (this.contextMenuResourceType === 'item') progress.items[this.contextMenuResourceId] = 0;
            else if (this.contextMenuResourceType === 'category') progress.categories[this.contextMenuResourceId] = 0;
        } else if (action === 'set-to-max') {
            if (this.contextMenuResourceType === 'item') progress.items[this.contextMenuResourceId] = this.contextMenuRequired;
            else if (this.contextMenuResourceType === 'category') progress.categories[this.contextMenuResourceId] = this.contextMenuRequired;
        }
        
        this.saveProgress();
        this.renderResourceList();
        
        if (this.selectedResource === this.contextMenuResourceId && this.selectedResourceType === this.contextMenuResourceType) {
            const collected = this.contextMenuResourceType === 'item' 
                ? progress.items[this.contextMenuResourceId] || 0
                : progress.categories[this.contextMenuResourceId] || 0;
            
            if (this.contextMenuResourceType === 'item') this.selectItemResource(this.contextMenuResourceId, this.contextMenuRequired, collected);
            else this.selectCategoryResource(this.contextMenuResourceId, this.contextMenuRequired, collected);
        }
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyE' && !e.repeat && this.selectedResource && this.currentAmount > 0) {
                e.preventDefault();
                this.isHoldingE = true;
                this.holdProgress = 0;
                this.startEButtonAnimation();
                
                this.eKeyHoldTimer = setTimeout(() => {
                    if (this.isHoldingE) {
                        this.commitResource();
                        this.stopEButtonAnimation();
                    }
                }, 500);
                
                this.eHoldProgressInterval = setInterval(() => {
                    if (this.isHoldingE && this.holdProgress < 100) this.holdProgress += 10;
                }, 50);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'KeyE' && this.isHoldingE) {
                this.isHoldingE = false;
                this.stopEButtonAnimation();
                if (this.eKeyHoldTimer) clearTimeout(this.eKeyHoldTimer);
                if (this.eHoldProgressInterval) clearInterval(this.eHoldProgressInterval);
            }
        });
    }

    startEButtonAnimation() {
        document.querySelector('.commit-button .key-icon')?.classList.add('holding');
    }

    stopEButtonAnimation() {
        document.querySelector('.commit-button .key-icon')?.classList.remove('holding');
    }

    selectAllText(element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    moveCaretToEnd(element) {
        if (element.textContent.length > 0) {
            const range = document.createRange();
            const selection = window.getSelection();
            range.setStart(element, 1);
            range.setEnd(element, 1);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            element.focus();
        }
    }

    renderProgressIndicators() {
        const container = document.getElementById('progress-indicators');
        container.innerHTML = '';
        
        this.currentProject.phases.forEach((phase, index) => {
            const item = document.createElement('div');
            let statusClass = 'inactive';
            if (index === this.currentPhaseIndex) statusClass = 'active';
            else if (this.isPhaseCompleted(phase.phase)) statusClass = 'completed';
            
            item.className = `progress-item ${statusClass}`;
            item.textContent = phase.phase;
            item.onclick = () => {
                this.currentPhaseIndex = index;
                this.renderProgressIndicators();
                this.renderProjectInfo();
                this.renderResourceList();
                this.resetCommitCard();
            };
            container.appendChild(item);
        });
    }

    renderProjectInfo() {
        const phase = this.currentProject.phases[this.currentPhaseIndex];
        document.getElementById('phase-title').textContent = `${phase.name.en} (${phase.phase}/6)`;
        document.getElementById('phase-description').textContent = phase.description?.en || 'Complete all requirements to progress.';
    }

    renderResourceList() {
        const container = document.getElementById('resource-list');
        const phase = this.currentProject.phases[this.currentPhaseIndex];
        container.innerHTML = '';
        
        if (phase.requirementItemIds && phase.requirementItemIds.length > 0) {
            phase.requirementItemIds.forEach(req => {
                const progress = this.getPhaseProgress();
                const collected = progress.items[req.itemId] || 0;
                const isComplete = collected >= req.quantity;
                const percentage = req.quantity > 0 ? Math.min((collected / req.quantity) * 100, 100) : 0;
                const itemName = formatItemName(req.itemId);
                
                const item = document.createElement('div');
                item.className = `resource-item ${isComplete ? 'completed' : ''}`;
                item.onclick = () => this.selectItemResource(req.itemId, req.quantity, collected);
                
                // FIXED: Proper HTML escaping for onerror attribute
                item.innerHTML = `
                    <div class="resource-image">
                        <img src="${getImagePath(req.itemId)}" alt="${itemName}" 
                            onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=&quot;placeholder&quot;>${req.itemId}</div>'">
                    </div>
                    <div class="resource-content">
                        <div class="resource-name">${itemName}</div>
                        <div class="resource-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                        <div class="progress-value">
                            ${collected}/${req.quantity}
                            ${isComplete ? '<div class="completed-checkmark"><svg width="16" height="16" viewBox="0 0 16 16"><path fill="none" d="M0 0h16v16H0z"/><path d="M0 9.014L1.414 7.6l3.59 3.589L14.593 1.6l1.414 1.414L5.003 14.017z" fill="#3d8694"/></svg></div>' : ''}
                        </div>
                    </div>
                `;
                container.appendChild(item);
            });
        }
        
        if (phase.requirementCategories && phase.requirementCategories.length > 0) {
            phase.requirementCategories.forEach(cat => {
                const progress = this.getPhaseProgress();
                const collected = progress.categories[cat.category] || 0;
                const isComplete = collected >= cat.valueRequired;
                const percentage = cat.valueRequired > 0 ? Math.min((collected / cat.valueRequired) * 100, 100) : 0;
                const categoryType = cat.category.toLowerCase().replace(/\s+/g, '-');
                const categoryImagePath = this.getCategoryImagePath(cat.category);
                
                const item = document.createElement('div');
                item.className = `resource-item category-item ${categoryType} ${isComplete ? 'completed' : ''}`;
                item.onclick = () => this.selectCategoryResource(cat.category, cat.valueRequired, collected);
                
                // FIXED: Also fix the category image onerror
                item.innerHTML = `
                    <div class="resource-content">
                        <div class="category-header">
                            <div class="resource-name">${cat.category}</div>
                            <div class="category-image">
                                <img src="${categoryImagePath}" alt="${cat.category}" 
                                    onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;width:24px;height:24px;background:rgba(255,215,0,0.1);border-radius:4px;display:flex;align-items:center;justify-content:center;color:#FFD700;font-size:14px;&quot;>💎</div>'">
                            </div>
                        </div>
                        <div class="resource-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                        <div class="progress-value">
                            <span class="coins-icon">
                                <img src="assets/coins.png" alt="Coins">
                            </span>
                            ${formatNumber(collected)}/${formatNumber(cat.valueRequired)}
                            ${isComplete ? '<div class="completed-checkmark"><svg width="16" height="16" viewBox="0 0 16 16"><path fill="none" d="M0 0h16v16H0z"/><path d="M0 9.014L1.414 7.6l3.59 3.589L14.593 1.6l1.414 1.414L5.003 14.017z" fill="#3d8694"/></svg></div>' : ''}
                        </div>
                    </div>
                `;
                container.appendChild(item);
            });
        }
    }

    getCategoryImagePath(categoryName) {
        const categoryMap = {
            'Combat Items': 'assets/combat-items.png',
            'Survival Items': 'assets/survival-items.png',
            'Provisions': 'assets/provisions.png',
            'Materials': 'assets/materials.png',
            'Value': 'assets/expedition-value.png'
        };
        return categoryMap[categoryName] || 'default-category.png';
    }

    selectItemResource(itemId, required, collected) {
        if (this.selectedItemElement) this.selectedItemElement.classList.remove('selected');
        const clickedItem = this.findClickedElement(itemId, 'item');
        if (clickedItem) {
            clickedItem.classList.add('selected');
            this.selectedItemElement = clickedItem;
        }
        
        this.selectedResource = itemId;
        this.selectedResourceType = 'item';
        this.originalRequired = required;
        this.alreadyCollected = collected;
        this.remainingAmount = Math.max(0, required - collected);
        this.currentAmount = 0;
        
        document.getElementById('commitTitle').textContent = `COMMIT ${formatItemName(itemId)}`;
        document.getElementById('commitProgress').textContent = `0/${this.remainingAmount}`;
        
        const amountDisplay = document.getElementById('amountDisplay');
        if (amountDisplay) {
            amountDisplay.textContent = "0";
            amountDisplay.setAttribute('contenteditable', this.remainingAmount > 0 ? 'true' : 'false');
        }
        
        document.getElementById('amountInput').value = 0;
        
        const amountContainer = document.querySelector('.amount-input-container');
        if (amountContainer) amountContainer.classList.remove('disabled');
        
        this.updateControlButtons();
    }

    selectCategoryResource(category, required, collected) {
        if (this.selectedItemElement) this.selectedItemElement.classList.remove('selected');
        const clickedItem = this.findClickedElement(category, 'category');
        if (clickedItem) {
            clickedItem.classList.add('selected');
            this.selectedItemElement = clickedItem;
        }
        
        this.selectedResource = category;
        this.selectedResourceType = 'category';
        this.originalRequired = required;
        this.alreadyCollected = collected;
        this.remainingAmount = Math.max(0, required - collected);
        this.currentAmount = 0;
        
        document.getElementById('commitTitle').textContent = `COMMIT ${category}`;
        document.getElementById('commitProgress').textContent = `0/${formatNumber(this.remainingAmount)}`;
        
        const amountDisplay = document.getElementById('amountDisplay');
        if (amountDisplay) {
            amountDisplay.textContent = "0";
            amountDisplay.setAttribute('contenteditable', this.remainingAmount > 0 ? 'true' : 'false');
        }
        
        document.getElementById('amountInput').value = 0;
        
        const amountContainer = document.querySelector('.amount-input-container');
        if (amountContainer) amountContainer.classList.remove('disabled');
        
        this.updateControlButtons();
    }

    findClickedElement(identifier, type) {
        if (type === 'item') {
            const items = document.querySelectorAll('.resource-item:not(.category-item)');
            for (const item of items) {
                const nameElement = item.querySelector('.resource-name');
                if (nameElement && nameElement.textContent === formatItemName(identifier)) return item;
            }
        } else if (type === 'category') {
            const items = document.querySelectorAll('.resource-item.category-item');
            for (const item of items) {
                const nameElement = item.querySelector('.resource-name');
                if (nameElement && nameElement.textContent === identifier) return item;
            }
        }
        return null;
    }

    incrementAmount() {
        if (this.selectedResource && this.currentAmount < this.remainingAmount) {
            this.currentAmount++;
            this.updateAmountDisplay();
            this.updateCommitProgress();
            this.updateControlButtons();
            setTimeout(() => this.moveCaretToEnd(document.getElementById('amountDisplay')), 10);
        }
    }

    decrementAmount() {
        if (this.currentAmount > 0) {
            this.currentAmount--;
            this.updateAmountDisplay();
            this.updateCommitProgress();
            this.updateControlButtons();
            setTimeout(() => this.moveCaretToEnd(document.getElementById('amountDisplay')), 10);
        }
    }

    updateAmountDisplay() {
        const amountDisplay = document.getElementById('amountDisplay');
        const amountInput = document.getElementById('amountInput');
        if (amountDisplay) amountDisplay.textContent = this.currentAmount.toString();
        if (amountInput) amountInput.value = this.currentAmount;
    }

    updateControlButtons() {
        const minusButton = document.querySelector('.minus-button');
        const plusButton = document.querySelector('.plus-button');
        const amountContainer = document.querySelector('.amount-input-container');
        
        if (minusButton) minusButton.disabled = this.currentAmount <= 0;
        if (plusButton) plusButton.disabled = this.currentAmount >= this.remainingAmount;
        if (amountContainer) amountContainer.classList.toggle('disabled', !this.selectedResource);
    }

    updateCommitProgress() {
        const progress = document.getElementById('commitProgress');
        if (this.selectedResourceType === 'category') {
            progress.textContent = `${formatNumber(this.currentAmount)}/${formatNumber(this.remainingAmount)}`;
        } else {
            progress.textContent = `${this.currentAmount}/${this.remainingAmount}`;
        }
    }

    commitResource() {
        if (!this.selectedResource || this.currentAmount <= 0) return;
        
        const progress = this.getPhaseProgress();
        
        if (this.selectedResourceType === 'item') {
            const currentCollected = progress.items[this.selectedResource] || 0;
            progress.items[this.selectedResource] = currentCollected + this.currentAmount;
        } else if (this.selectedResourceType === 'category') {
            const currentCollected = progress.categories[this.selectedResource] || 0;
            progress.categories[this.selectedResource] = currentCollected + this.currentAmount;
        }
        
        this.saveProgress();
        this.renderResourceList();
        this.showCommitFeedback();
        
        if (this.selectedResourceType === 'item') {
            this.selectItemResource(this.selectedResource, this.originalRequired, progress.items[this.selectedResource] || 0);
        } else {
            this.selectCategoryResource(this.selectedResource, this.originalRequired, progress.categories[this.selectedResource] || 0);
        }
    }

    showCommitFeedback() {
        const commitButton = document.querySelector('.commit-button');
        const originalText = commitButton.innerHTML;
        const originalBg = commitButton.style.background;
        
        commitButton.innerHTML = '<span>COMMITTED!</span>';
        commitButton.style.background = 'linear-gradient(90deg, #3d8694, #3d7494)';
        
        setTimeout(() => {
            commitButton.innerHTML = originalText;
            commitButton.style.background = originalBg;
        }, 1000);
    }

    resetCommitCard() {
        // Clear selection
        if (this.selectedItemElement) {
            this.selectedItemElement.classList.remove('selected');
            this.selectedItemElement = null;
        }
        
        this.selectedResource = null;
        this.selectedResourceType = null;
        this.currentAmount = 0;
        this.originalRequired = 0;
        this.alreadyCollected = 0;
        this.remainingAmount = 0;
        
        document.getElementById('commitTitle').textContent = 'SELECT A RESOURCE';
        document.getElementById('commitProgress').textContent = '0/0';
        
        const amountDisplay = document.getElementById('amountDisplay');
        if (amountDisplay) {
            amountDisplay.textContent = '0';
            amountDisplay.setAttribute('contenteditable', 'true');
        }
        
        document.getElementById('amountInput').value = '0';
        
        const amountContainer = document.querySelector('.amount-input-container');
        if (amountContainer) amountContainer.classList.add('disabled');
        
        this.updateControlButtons();
    }
}

function updateCountdownTimer() {
    const targetDate = new Date(Date.UTC(2026, 1, 22, 7, 0, 0));
    
    function updateDisplay(days, hours, minutes) {
        document.getElementById('days').textContent = days;
        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;
    }
    
    function update() {
        const now = new Date();
        const diff = targetDate - now;
        
        if (diff <= 0) {
            document.querySelector('.countdown-label').textContent = 'WINDOW IS OPEN';
            document.querySelector('.countdown-display').innerHTML = 'EXPEDITION READY';
            document.querySelector('.countdown-display').style.background = 'linear-gradient(90deg, #3d8694, #3d7494)';
            document.querySelector('.countdown-display').style.color = '#ffffff';
            return;
        }
        
        const totalSeconds = Math.floor(diff / 1000);
        const days = Math.floor(totalSeconds / (3600 * 24));
        const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        updateDisplay(days, hours, minutes);
    }
    
    update();
    const timerInterval = setInterval(update, 1000);
    window.countdownInterval = timerInterval;
}

document.addEventListener('DOMContentLoaded', async () => {
    window.tracker = new ExpeditionTracker();
    updateCountdownTimer();
});

if (typeof formatItemName !== 'function') {
    window.formatItemName = function(itemId) {
        return itemId.replace(/_/g, ' ').toUpperCase();
    };
}

if (typeof getImagePath !== 'function') {
    window.getImagePath = function(itemId) {
        return `${itemId.toLowerCase()}.png`;
    };
}

if (typeof formatNumber !== 'function') {
    window.formatNumber = function(num) {
        return num.toLocaleString();
    };
}