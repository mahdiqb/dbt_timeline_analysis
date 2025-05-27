// Advanced D3.js Timeline Visualization for dbt models
document.addEventListener('DOMContentLoaded', function() {
    createAdvancedDbtTimeline();
});

class AdvancedTimelineVisualization {
    constructor() {
        this.config = {
            width: 1400,
            height: 700,
            margin: { top: 60, right: 50, bottom: 50, left: 150 },
            nodeRadius: 8,
            layerHeight: 150,
            layerColors: {
                'source': '#6c757d',
                'staging': '#0dcaf0', 
                'intermediate': '#198754',
                'marts': '#ffc107'
            },
            performanceColors: {
                'fast': '#28a745',      // Green for fast execution
                'normal': '#6c757d',    // Gray for normal
                'slow': '#ffc107',      // Yellow for slow
                'critical': '#dc3545'   // Red for critical/failed
            },
            timelineDuration: null, // Will be calculated dynamically
            slaThreshold: 20,
            slowThreshold: 2.0,     // seconds
            criticalThreshold: 5.0  // seconds
        };
        
        this.showCriticalPath = false;
        this.showHistorical = false;
        
        this.selectedModel = null;
        this.zoom = d3.zoom().scaleExtent([0.5, 3]).on("zoom", this.handleZoom.bind(this));
    }
    
    init() {
        this.createSVG();
        this.createControls();
        this.loadData(); // This will handle async loading and rendering
    }
    
    createSVG() {
        // Clear existing content
        d3.select("#advanced-timeline").html("");
        
        // Create main container
        this.container = d3.select("#advanced-timeline")
            .append("div")
            .attr("class", "timeline-container")
            .style("position", "relative");
            
        // Create SVG
        this.svg = this.container
            .append("svg")
            .attr("width", "100%")
            .attr("height", this.config.height)
            .attr("viewBox", `0 0 ${this.config.width} ${this.config.height}`)
            .attr("class", "advanced-timeline-svg")
            .style("max-width", "100%")
            .call(this.zoom);
            
        // Create main group
        this.g = this.svg.append("g")
            .attr("class", "main-group")
            .attr("transform", `translate(${this.config.margin.left},${this.config.margin.top})`);
            
        // Create tooltip
        this.tooltip = this.container
            .append("div")
            .attr("class", "timeline-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0,0,0,0.9)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "5px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("z-index", 1000);
    }
    
    createControls() {
        // Controls removed per user request
    }
    
    loadData() {
        // Load real data from dbt_artifacts
        this.loadRealData();
    }
    
    async loadRealData() {
        try {
            const response = await fetch('/api/real-timeline-data');
            const result = await response.json();
            
            if (result.success && result.data.length > 0) {
                // Use real data from dbt_artifacts
                this.modelData = {
                    nodes: this.processRealData(result.data)
                };
                console.log(`Loaded ${result.data.length} models with real execution history`);
            } else {
                // Fallback to demo data if no real data available
                console.log('No real data available, using demo data:', result.message);
                this.loadDemoData();
            }
        } catch (error) {
            console.log('Failed to load real data, using demo data:', error);
            this.loadDemoData();
        }
        
        // Continue with data processing
        this.processData();
        this.render();
        
        // Store data globally for statistics
        window.timelineData = this.modelData;
        
        // Update statistics after data is loaded
        setTimeout(() => {
            if (typeof updateStatistics === 'function') {
                updateStatistics();
            }
            if (typeof generateInsights === 'function') {
                generateInsights();
            }
        }, 100);
    }
    
    processRealData(realData) {
        const nodes = [];
        
        // Calculate total timeline duration based on actual data
        const totalExecutionTime = realData.reduce((sum, model) => sum + model.executionTime, 0);
        const maxSingleExecution = Math.max(...realData.map(m => m.executionTime));
        
        // Dynamic timeline configuration based on data
        this.config.timelineDuration = Math.max(totalExecutionTime * 1.2, maxSingleExecution * 3, 30);
        
        // Group by layers and simulate realistic execution flow
        const layerGroups = {
            'staging': realData.filter(m => m.layer === 'staging'),
            'intermediate': realData.filter(m => m.layer === 'intermediate'), 
            'marts': realData.filter(m => m.layer === 'marts')
        };
        
        let currentTime = 0;
        const layerOrder = ['staging', 'intermediate', 'marts'];
        
        layerOrder.forEach(layer => {
            const layerModels = layerGroups[layer];
            if (layerModels.length === 0) return;
            
            // Sort within layer by execution time for better visualization
            layerModels.sort((a, b) => a.executionTime - b.executionTime);
            
            const layerStartTime = currentTime;
            let maxLayerEndTime = currentTime;
            
            // For staging models, they can run in parallel
            if (layer === 'staging') {
                layerModels.forEach((model, index) => {
                    const startTime = layerStartTime + (index * 0.5); // Slight stagger
                    const endTime = startTime + model.executionTime;
                    maxLayerEndTime = Math.max(maxLayerEndTime, endTime);
                    
                    nodes.push({
                        ...model,
                        startTime: startTime,
                        dependencies: []
                    });
                });
            } else {
                // Intermediate and marts models depend on previous layers
                layerModels.forEach((model, index) => {
                    const startTime = currentTime + (index * 1.0); // More gap for dependent models
                    const endTime = startTime + model.executionTime;
                    maxLayerEndTime = Math.max(maxLayerEndTime, endTime);
                    
                    nodes.push({
                        ...model,
                        startTime: startTime,
                        dependencies: layer === 'intermediate' ? 
                            layerGroups['staging'].map(m => m.id) : 
                            [...layerGroups['staging'], ...layerGroups['intermediate']].map(m => m.id)
                    });
                });
            }
            
            // Next layer starts after this layer completes
            currentTime = maxLayerEndTime + 1;
        });
        
        return nodes;
    }
    
    loadDemoData() {
        // Enhanced model data with performance metrics and historical data
        this.modelData = {
            nodes: [
                // Source nodes
                { 
                    id: "raw_customers", name: "customers", layer: "source", 
                    executionTime: 0, startTime: 0, dependencies: [],
                    rowsProcessed: 50000, avgExecutionTime: 0, status: "success",
                    description: "Customer master data from CRM system",
                    historicalTimes: [0, 0, 0, 0, 0]
                },
                { 
                    id: "raw_products", name: "products", layer: "source", 
                    executionTime: 0, startTime: 0, dependencies: [],
                    rowsProcessed: 25000, avgExecutionTime: 0, status: "success",
                    description: "Product catalog and pricing information",
                    historicalTimes: [0, 0, 0, 0, 0]
                },
                { 
                    id: "raw_orders", name: "orders", layer: "source", 
                    executionTime: 0, startTime: 0, dependencies: [],
                    rowsProcessed: 150000, avgExecutionTime: 0, status: "success",
                    description: "Order transaction data",
                    historicalTimes: [0, 0, 0, 0, 0]
                },
                { 
                    id: "raw_order_items", name: "order_items", layer: "source", 
                    executionTime: 0, startTime: 0, dependencies: [],
                    rowsProcessed: 500000, avgExecutionTime: 0, status: "success",
                    description: "Individual line items for each order",
                    historicalTimes: [0, 0, 0, 0, 0]
                },
                
                // Staging nodes
                { 
                    id: "stg_customers", name: "stg_ecommerce__customers", layer: "staging", 
                    executionTime: 1.2, startTime: 2, dependencies: ["raw_customers"],
                    rowsProcessed: 48500, avgExecutionTime: 1.1, status: "success",
                    description: "Cleaned and standardized customer data",
                    historicalTimes: [1.0, 1.1, 1.3, 1.2, 1.4],
                    costUSD: 0.05
                },
                { 
                    id: "stg_products", name: "stg_ecommerce__products", layer: "staging", 
                    executionTime: 0.8, startTime: 3, dependencies: ["raw_products"],
                    rowsProcessed: 24800, avgExecutionTime: 0.9, status: "success",
                    description: "Product data with categorization",
                    historicalTimes: [0.7, 0.8, 0.9, 0.8, 1.0],
                    costUSD: 0.03
                },
                { 
                    id: "stg_orders", name: "stg_ecommerce__orders", layer: "staging", 
                    executionTime: 2.1, startTime: 4, dependencies: ["raw_orders"],
                    rowsProcessed: 148200, avgExecutionTime: 1.8, status: "warning",
                    description: "Order data with date parsing and validation",
                    historicalTimes: [1.5, 1.7, 2.0, 2.1, 2.3],
                    costUSD: 0.08
                },
                { 
                    id: "stg_order_items", name: "stg_ecommerce__order_items", layer: "staging", 
                    executionTime: 3.2, startTime: 5, dependencies: ["raw_order_items"],
                    rowsProcessed: 495000, avgExecutionTime: 2.8, status: "slow",
                    description: "Order line items with price calculations",
                    historicalTimes: [2.5, 2.8, 3.0, 3.2, 3.5],
                    costUSD: 0.12
                },
                
                // Intermediate nodes
                { 
                    id: "int_customer_orders", name: "int_customer_orders", layer: "intermediate", 
                    executionTime: 4.1, startTime: 10, dependencies: ["stg_customers", "stg_orders", "stg_order_items"],
                    rowsProcessed: 145000, avgExecutionTime: 3.8, status: "slow",
                    description: "Customer order aggregations and metrics",
                    historicalTimes: [3.2, 3.5, 3.8, 4.1, 4.3],
                    costUSD: 0.18
                },
                { 
                    id: "int_order_items_products", name: "int_order_items_products", layer: "intermediate", 
                    executionTime: 2.8, startTime: 12, dependencies: ["stg_order_items", "stg_products"],
                    rowsProcessed: 490000, avgExecutionTime: 2.5, status: "normal",
                    description: "Product performance analytics",
                    historicalTimes: [2.2, 2.4, 2.5, 2.8, 2.9],
                    costUSD: 0.14
                },
                
                // Marts nodes
                { 
                    id: "dim_customers", name: "dim_customers", layer: "marts", 
                    executionTime: 1.5, startTime: 15, dependencies: ["stg_customers"],
                    rowsProcessed: 48000, avgExecutionTime: 1.3, status: "success",
                    description: "Customer dimension table for analytics",
                    historicalTimes: [1.1, 1.2, 1.3, 1.5, 1.4],
                    costUSD: 0.06
                },
                { 
                    id: "dim_products", name: "dim_products", layer: "marts", 
                    executionTime: 1.1, startTime: 16, dependencies: ["stg_products"],
                    rowsProcessed: 24500, avgExecutionTime: 1.0, status: "success",
                    description: "Product dimension table for analytics",
                    historicalTimes: [0.9, 1.0, 1.1, 1.1, 1.2],
                    costUSD: 0.04
                },
                { 
                    id: "fct_orders", name: "fct_orders", layer: "marts", 
                    executionTime: 5.8, startTime: 18, dependencies: ["int_customer_orders", "int_order_items_products", "stg_orders"],
                    rowsProcessed: 145000, avgExecutionTime: 5.2, status: "critical",
                    description: "Main fact table for order analytics",
                    historicalTimes: [4.8, 5.0, 5.2, 5.8, 6.1],
                    costUSD: 0.28
                },
                { 
                    id: "mart_customer_orders", name: "mart_customer_orders", layer: "marts", 
                    executionTime: 3.4, startTime: 22, dependencies: ["dim_customers", "fct_orders", "stg_orders"],
                    rowsProcessed: 48000, avgExecutionTime: 3.1, status: "slow",
                    description: "Customer order summary mart",
                    historicalTimes: [2.8, 2.9, 3.1, 3.4, 3.6],
                    costUSD: 0.16
                }
            ]
        };
        
        // Store data globally for statistics
        window.timelineData = this.modelData;
        
        // Update statistics after demo data is loaded
        setTimeout(() => {
            if (typeof updateStatistics === 'function') {
                updateStatistics();
            }
            if (typeof generateInsights === 'function') {
                generateInsights();
            }
        }, 100);
    }
    
    processData() {
        if (!this.modelData || !this.modelData.nodes) return;
        
        // Calculate dynamic timeline duration based on actual execution
        const executionModels = this.modelData.nodes.filter(n => n.layer !== 'source');
        if (executionModels.length > 0) {
            const maxEndTime = Math.max(...executionModels.map(n => n.startTime + n.executionTime));
            // Add small buffer (10% extra or minimum 2 seconds) for visual clarity
            this.config.timelineDuration = Math.max(maxEndTime * 1.1, maxEndTime + 2);
        } else {
            this.config.timelineDuration = 30; // fallback
        }
        
        // Calculate performance status based on execution time
        this.modelData.nodes.forEach(node => {
            if (node.layer === 'source') return;
            
            if (!node.performanceStatus) {
                if (node.executionTime > this.config.criticalThreshold) {
                    node.performanceStatus = 'critical';
                } else if (node.executionTime > this.config.slowThreshold) {
                    node.performanceStatus = 'slow';
                } else if (node.executionTime < (node.avgExecutionTime || node.executionTime) * 0.8) {
                    node.performanceStatus = 'fast';
                } else {
                    node.performanceStatus = 'normal';
                }
            }
        });
        
        // Generate links and calculate critical path
        this.generateLinks();
        this.calculateCriticalPath();
    }
    
    generateLinks() {
        this.modelData.links = [];
        this.modelData.nodes.forEach(node => {
            node.dependencies.forEach(depId => {
                this.modelData.links.push({
                    source: depId,
                    target: node.id,
                    layer: node.layer
                });
            });
        });
    }
    
    calculateCriticalPath() {
        // Find the longest path through the DAG
        const nodesById = {};
        this.modelData.nodes.forEach(node => {
            nodesById[node.id] = { ...node, criticalPathTime: node.executionTime };
        });
        
        // Topological sort and find longest path
        const visited = new Set();
        const criticalPath = new Set();
        
        const dfs = (nodeId) => {
            if (visited.has(nodeId)) return nodesById[nodeId].criticalPathTime;
            
            visited.add(nodeId);
            const node = nodesById[nodeId];
            let maxDepTime = 0;
            
            node.dependencies.forEach(depId => {
                const depTime = dfs(depId);
                maxDepTime = Math.max(maxDepTime, depTime);
            });
            
            node.criticalPathTime = maxDepTime + node.executionTime;
            return node.criticalPathTime;
        };
        
        // Calculate critical path times for all nodes
        this.modelData.nodes.forEach(node => {
            if (!visited.has(node.id)) {
                dfs(node.id);
            }
        });
        
        // Find the critical path by backtracking from the longest time
        const maxTime = Math.max(...Object.values(nodesById).map(n => n.criticalPathTime));
        const findCriticalPath = (nodeId, targetTime) => {
            const node = nodesById[nodeId];
            if (Math.abs(node.criticalPathTime - targetTime) < 0.01) {
                criticalPath.add(nodeId);
                node.dependencies.forEach(depId => {
                    findCriticalPath(depId, targetTime - node.executionTime);
                });
            }
        };
        
        // Start from nodes with maximum critical path time
        Object.values(nodesById).forEach(node => {
            if (Math.abs(node.criticalPathTime - maxTime) < 0.01) {
                findCriticalPath(node.id, maxTime);
            }
        });
        
        this.criticalPath = criticalPath;
    }
    
    render() {
        this.createScales();
        this.calculateLayout();
        this.drawBackground();
        this.drawTimeAxis();
        this.drawModels();
        this.drawDependencies();
    }
    
    createScales() {
        this.xScale = d3.scaleLinear()
            .domain([0, this.config.timelineDuration])
            .range([0, this.config.width - this.config.margin.left - this.config.margin.right]);
    }
    
    calculateLayout() {
        // Group nodes by layer
        const nodesByLayer = {
            'staging': this.modelData.nodes.filter(n => n.layer === 'staging'),
            'intermediate': this.modelData.nodes.filter(n => n.layer === 'intermediate'),
            'marts': this.modelData.nodes.filter(n => n.layer === 'marts')
        };
        
        // Calculate dynamic layer heights based on number of models
        const layerOrder = ['staging', 'intermediate', 'marts'];
        let currentY = 0;
        
        layerOrder.forEach(layer => {
            const nodes = nodesByLayer[layer];
            if (nodes.length === 0) return;
            
            // Dynamic height based on number of models in layer
            const modelsInLayer = nodes.length;
            const dynamicLayerHeight = Math.max(100, modelsInLayer * 50 + 50);
            
            const layerY = currentY;
            
            // Sort nodes by start time for better visual flow
            nodes.sort((a, b) => a.startTime - b.startTime);
            
            nodes.forEach((node, i) => {
                // Dynamic vertical spacing based on layer size
                const verticalSpacing = dynamicLayerHeight / (modelsInLayer + 1);
                node.y = layerY + verticalSpacing * (i + 1);
                node.x = this.xScale(node.startTime);
                node.endX = this.xScale(node.startTime + node.executionTime);
            });
            
            currentY += dynamicLayerHeight;
        });
        
        // Update total height based on actual content
        this.config.height = Math.max(400, currentY + 100);
        this.svg.attr("height", this.config.height)
               .attr("viewBox", `0 0 ${this.config.width} ${this.config.height}`);
    }
    
    drawBackground() {
        // Group nodes by layer to get actual layer boundaries
        const nodesByLayer = {
            'staging': this.modelData.nodes.filter(n => n.layer === 'staging'),
            'intermediate': this.modelData.nodes.filter(n => n.layer === 'intermediate'),
            'marts': this.modelData.nodes.filter(n => n.layer === 'marts')
        };
        
        const layerOrder = ['staging', 'intermediate', 'marts'];
        let currentY = 0;
        
        layerOrder.forEach(layer => {
            const nodes = nodesByLayer[layer];
            if (nodes.length === 0) return;
            
            // Calculate dynamic layer height
            const modelsInLayer = nodes.length;
            const dynamicLayerHeight = Math.max(100, modelsInLayer * 50 + 50);
            
            // Draw layer background
            this.g.append("rect")
                .attr("class", `layer-bg layer-${layer}`)
                .attr("x", 0)
                .attr("y", currentY - 15)
                .attr("width", this.config.width - this.config.margin.left - this.config.margin.right)
                .attr("height", dynamicLayerHeight)
                .attr("fill", `${this.config.layerColors[layer]}15`)
                .attr("stroke", `${this.config.layerColors[layer]}30`)
                .attr("rx", 8);
                
            // Layer labels
            this.g.append("text")
                .attr("class", "layer-label")
                .attr("x", -180)
                .attr("y", currentY + dynamicLayerHeight/2)
                .attr("text-anchor", "start")
                .attr("dominant-baseline", "middle")
                .style("font-weight", "bold")
                .style("font-size", "16px")
                .style("fill", this.config.layerColors[layer])
                .text(layer.toUpperCase());
                
            currentY += dynamicLayerHeight;
        });
        
        // Dynamic SLA threshold line - only show if it's within the timeline range
        if (this.config.slaThreshold < this.config.timelineDuration) {
            this.g.append("line")
                .attr("class", "sla-line")
                .attr("x1", this.xScale(this.config.slaThreshold))
                .attr("y1", -30)
                .attr("x2", this.xScale(this.config.slaThreshold))
                .attr("y2", currentY)
                .attr("stroke", "#dc3545")
                .attr("stroke-dasharray", "8,4")
                .attr("stroke-width", 2);
                
            this.g.append("text")
                .attr("class", "sla-label")
                .attr("x", this.xScale(this.config.slaThreshold))
                .attr("y", -40)
                .attr("text-anchor", "middle")
                .style("fill", "#dc3545")
                .style("font-weight", "bold")
                .style("font-size", "12px")
                .text(`SLA: ${this.config.slaThreshold}s`);
        }
    }
    
    drawTimeAxis() {
        // Dynamic tick count based on timeline duration
        const tickCount = Math.max(5, Math.min(20, Math.floor(this.config.timelineDuration / 5)));
        
        const timeAxis = d3.axisTop(this.xScale)
            .ticks(tickCount)
            .tickFormat(d => `${d}s`);
            
        this.g.append("g")
            .attr("class", "time-axis")
            .style("font-size", "12px")
            .call(timeAxis);
    }
    
    drawModels() {
        const timeline = this;
        
        // Show all nodes since filters are removed
        const visibleNodes = this.modelData.nodes;
        
        // Draw execution bars
        visibleNodes.forEach(node => {
            if (node.layer === 'source') return;
            
            const isCritical = this.criticalPath.has(node.id);
            const performanceColor = this.config.performanceColors[node.performanceStatus];
            
            // Main execution bar
            const bar = this.g.append("rect")
                .attr("class", `timeline-bar model-${node.id}`)
                .attr("x", this.xScale(node.startTime))
                .attr("y", node.y - 12)
                .attr("width", Math.max(2, this.xScale(node.startTime + node.executionTime) - this.xScale(node.startTime)))
                .attr("height", 24)
                .attr("rx", 6)
                .attr("fill", performanceColor)
                .attr("stroke", isCritical && this.showCriticalPath ? "#ff6b6b" : "none")
                .attr("stroke-width", isCritical && this.showCriticalPath ? 3 : 0)
                .style("cursor", "pointer")
                .on("mouseover", (event) => this.showTooltip(event, node))
                .on("mouseout", () => this.hideTooltip())
                .on("click", () => this.selectModel(node));
                
            // Historical comparison overlay
            if (this.showHistorical) {
                const avgTime = node.historicalTimes.reduce((a, b) => a + b, 0) / node.historicalTimes.length;
                const currentVsAvg = node.executionTime / avgTime;
                
                this.g.append("rect")
                    .attr("class", "historical-overlay")
                    .attr("x", this.xScale(node.startTime))
                    .attr("y", node.y - 8)
                    .attr("width", Math.max(1, this.xScale(node.startTime + avgTime) - this.xScale(node.startTime)))
                    .attr("height", 16)
                    .attr("rx", 3)
                    .attr("fill", "none")
                    .attr("stroke", currentVsAvg > 1.2 ? "#dc3545" : currentVsAvg < 0.8 ? "#28a745" : "#6c757d")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "3,2")
                    .style("pointer-events", "none");
            }
            
            // Performance indicator
            this.g.append("circle")
                .attr("class", "performance-indicator")
                .attr("cx", this.xScale(node.startTime) - 15)
                .attr("cy", node.y)
                .attr("r", 4)
                .attr("fill", performanceColor)
                .style("pointer-events", "none");
        });
        
        // Draw model labels
        visibleNodes.forEach(node => {
            const labelX = node.layer === 'source' ? node.x + 20 : this.xScale(node.startTime) + 5;
            const labelY = node.layer === 'source' ? node.y : node.y - 20;
            
            this.g.append("text")
                .attr("class", `node-label model-label-${node.id}`)
                .attr("x", labelX)
                .attr("y", labelY)
                .attr("text-anchor", "start")
                .attr("dominant-baseline", "middle")
                .style("font-size", "11px")
                .style("font-weight", "500")
                .style("pointer-events", "none")
                .text(this.formatModelName(node.name));
                
            // Execution time label
            if (node.layer !== 'source') {
                const barCenter = this.xScale(node.startTime) + (this.xScale(node.startTime + node.executionTime) - this.xScale(node.startTime)) / 2;
                
                this.g.append("text")
                    .attr("class", "time-label")
                    .attr("x", barCenter)
                    .attr("y", node.y + 2)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                    .style("font-size", "10px")
                    .style("fill", "white")
                    .style("font-weight", "bold")
                    .style("pointer-events", "none")
                    .text(`${node.executionTime}s`);
            }
        });
    }
    
    drawDependencies() {
        const nodesById = {};
        this.modelData.nodes.forEach(node => {
            nodesById[node.id] = node;
        });
        
        // Show all links since filters are removed
        const visibleLinks = this.modelData.links;
        
        // Create link generator
        const linkGenerator = d3.linkHorizontal()
            .x(d => d.x)
            .y(d => d.y);
            
        // Draw dependency lines
        visibleLinks.forEach(link => {
            const source = nodesById[link.source];
            const target = nodesById[link.target];
            
            const isCriticalLink = this.criticalPath.has(source.id) && this.criticalPath.has(target.id);
            
            const linkData = {
                source: {
                    x: source.layer === 'source' ? source.x + 20 : source.endX,
                    y: source.y
                },
                target: {
                    x: this.xScale(target.startTime),
                    y: target.y
                }
            };
            
            this.g.append("path")
                .attr("class", "dependency-link")
                .attr("d", linkGenerator(linkData))
                .attr("stroke", isCriticalLink && this.showCriticalPath ? "#ff6b6b" : `${this.config.layerColors[target.layer]}60`)
                .attr("stroke-width", isCriticalLink && this.showCriticalPath ? 3 : 1.5)
                .attr("fill", "none")
                .attr("marker-end", "url(#arrow)")
                .style("pointer-events", "none");
        });
        
        // Add arrow marker
        if (!this.svg.select("defs").node()) {
            this.svg.append("defs");
        }
        
        this.svg.select("defs").selectAll("marker").remove();
        this.svg.select("defs").append("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#6c757d");
    }
    
    // Legend removed per user request
    
    showTooltip(event, node) {
        const tooltip = this.tooltip;
        const cost = node.costUSD ? `$${node.costUSD.toFixed(3)}` : 'N/A';
        const avgTime = node.historicalTimes.reduce((a, b) => a + b, 0) / node.historicalTimes.length;
        const trend = node.executionTime > avgTime * 1.1 ? '↗️' : node.executionTime < avgTime * 0.9 ? '↘️' : '➡️';
        
        tooltip.html(`
            <div style="max-width: 250px;">
                <div style="font-weight: bold; margin-bottom: 8px; color: ${this.config.layerColors[node.layer]};">
                    ${node.name}
                </div>
                <div style="margin-bottom: 4px;"><strong>Layer:</strong> ${node.layer}</div>
                <div style="margin-bottom: 4px;"><strong>Status:</strong> ${node.status}</div>
                <div style="margin-bottom: 4px;"><strong>Execution:</strong> ${node.executionTime}s ${trend}</div>
                <div style="margin-bottom: 4px;"><strong>Avg Time:</strong> ${avgTime.toFixed(1)}s</div>
                <div style="margin-bottom: 4px;"><strong>Rows:</strong> ${node.rowsProcessed?.toLocaleString() || 'N/A'}</div>
                <div style="margin-bottom: 4px;"><strong>Cost:</strong> ${cost}</div>
                <div style="margin-bottom: 4px;"><strong>Dependencies:</strong> ${node.dependencies.length}</div>
                ${node.description ? `<div style="margin-top: 8px; font-style: italic; font-size: 10px;">${node.description}</div>` : ''}
            </div>
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px")
        .style("opacity", 1);
        
        // Highlight related models
        this.highlightModel(node.id);
    }
    
    hideTooltip() {
        this.tooltip.style("opacity", 0);
        this.clearHighlights();
    }
    
    highlightModel(modelId) {
        // Dim all models
        this.g.selectAll(".timeline-bar").style("opacity", 0.3);
        this.g.selectAll(".dependency-link").style("opacity", 0.1);
        this.g.selectAll(".node-label").style("opacity", 0.3);
        
        // Highlight selected model
        this.g.selectAll(`.model-${modelId}`).style("opacity", 1);
        this.g.selectAll(`.model-label-${modelId}`).style("opacity", 1);
        
        // Highlight dependencies
        const node = this.modelData.nodes.find(n => n.id === modelId);
        if (node) {
            node.dependencies.forEach(depId => {
                this.g.selectAll(`.model-${depId}`).style("opacity", 1);
                this.g.selectAll(`.model-label-${depId}`).style("opacity", 1);
            });
        }
    }
    
    clearHighlights() {
        this.g.selectAll(".timeline-bar").style("opacity", 1);
        this.g.selectAll(".dependency-link").style("opacity", 1);
        this.g.selectAll(".node-label").style("opacity", 1);
    }
    
    selectModel(node) {
        this.selectedModel = node;
        
        // Update model details panel
        const detailsPanel = d3.select("#model-details");
        if (detailsPanel.node()) {
            detailsPanel.html(`
                <div class="card">
                    <div class="card-header bg-${this.getBootstrapClass(node.layer)}">
                        <h5 class="card-title m-0 text-white">${node.name}</h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Layer:</strong> ${node.layer}</p>
                                <p><strong>Status:</strong> <span class="badge bg-${this.getStatusClass(node.status)}">${node.status}</span></p>
                                <p><strong>Execution Time:</strong> ${node.executionTime}s</p>
                                <p><strong>Rows Processed:</strong> ${node.rowsProcessed?.toLocaleString() || 'N/A'}</p>
                                <p><strong>Cost:</strong> ${node.costUSD ? `$${node.costUSD.toFixed(3)}` : 'N/A'}</p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Dependencies:</strong> ${node.dependencies.length}</p>
                                <p><strong>Performance:</strong> <span class="badge" style="background-color: ${this.config.performanceColors[node.performanceStatus]}">${node.performanceStatus}</span></p>
                                <p><strong>Critical Path:</strong> ${this.criticalPath.has(node.id) ? 'Yes' : 'No'}</p>
                                ${node.description ? `<p><strong>Description:</strong> ${node.description}</p>` : ''}
                            </div>
                        </div>
                        <div class="mt-3">
                            <h6>Historical Performance:</h6>
                            <div class="d-flex align-items-center">
                                ${node.historicalTimes.map((time, i) => {
                                    const date = node.historicalDates && node.historicalDates[i] ? 
                                        new Date(node.historicalDates[i]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 
                                        `Run ${i + 1}`;
                                    return `<div class="me-2 text-center">
                                        <div style="height: ${Math.max(20, time * 10)}px; width: 20px; background-color: ${this.config.layerColors[node.layer]}; margin-bottom: 2px;"></div>
                                        <small style="font-size: 9px;">${date}</small>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `);
        }
    }
    
    toggleLayer(layer) {
        if (this.filters.layers.has(layer)) {
            this.filters.layers.delete(layer);
        } else {
            this.filters.layers.add(layer);
        }
        this.refresh();
    }
    
    toggleCriticalPath() {
        this.filters.showCriticalPath = !this.filters.showCriticalPath;
        this.refresh();
    }
    
    toggleHistorical() {
        this.filters.showHistorical = !this.filters.showHistorical;
        this.refresh();
    }
    
    handleSearch() {
        const searchTerm = this.searchInput.property("value").toLowerCase();
        
        this.g.selectAll(".node-label").style("opacity", node => {
            const modelName = d3.select(node).text().toLowerCase();
            return searchTerm === '' || modelName.includes(searchTerm) ? 1 : 0.3;
        });
        
        this.g.selectAll(".timeline-bar").style("opacity", function() {
            const modelId = d3.select(this).attr("class").match(/model-(\w+)/)?.[1];
            if (!modelId) return 1;
            
            const node = timeline.modelData.nodes.find(n => n.id === modelId);
            if (!node) return 1;
            
            return searchTerm === '' || node.name.toLowerCase().includes(searchTerm) ? 1 : 0.3;
        });
    }
    
    handleZoom(event) {
        this.g.attr("transform", `translate(${this.config.margin.left},${this.config.margin.top}) ${event.transform}`);
    }
    
    refresh() {
        this.g.selectAll("*").remove();
        this.render();
    }
    
    formatModelName(name) {
        return name.replace(/^(stg_|int_|dim_|fct_|mart_)/, '').replace(/_/g, ' ');
    }
    
    getBootstrapClass(layer) {
        const classMap = {
            'source': 'secondary',
            'staging': 'info', 
            'intermediate': 'success',
            'marts': 'warning'
        };
        return classMap[layer] || 'primary';
    }
    
    getStatusClass(status) {
        const classMap = {
            'success': 'success',
            'warning': 'warning',
            'slow': 'warning',
            'critical': 'danger',
            'error': 'danger'
        };
        return classMap[status] || 'secondary';
    }
}

// Global variable to access the timeline instance
let timeline;

function createAdvancedDbtTimeline() {
    timeline = new AdvancedTimelineVisualization();
    timeline.init();
}