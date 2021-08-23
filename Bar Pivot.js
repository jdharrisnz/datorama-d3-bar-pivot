var barPivot = {
	'initialize': function() {
		// Wrapper function to get field details
			function getFieldDetails(field) {
				return new Promise((resolve, reject) => {
					DA.query.getFieldDetails({ systemName: field, cb: (err, data) => {
						resolve(data);
					}});
				});
			}

		// Wrapper function to get design settings
			function getDesignSettings() {
				return new Promise((resolve, reject) => {
					DA.widget.customDesignSettings.get( {cb: (err, params) => {
						resolve(params);
					}});
				});
			}

		// Extend the date class with getWeek()
			// ISO 8601: The week with the year's January 4 in it is w01, if weeks start on Monday (dowOffset 1)
			Date.prototype.getWeek = function(dowOffset) {
				// Validate dowOffset input
					dowOffset = [0,1,2,3,4,5,6].includes(dowOffset) ? dowOffset : 1;

				// Get last, this, and next year starts
					var yearStarts = [this.getFullYear() - 1, this.getFullYear(), this.getFullYear() + 1].map(x => {
						var weekOne = new Date(x, 0, 4);
						return new Date(weekOne - (weekOne.getDay() - dowOffset) * 1000*60*60*24);
					});

				// Calculate week number based on which week-year the date we're looking at is in
				// Round clears DST differences, floor + 1 puts all days in the right week
					var weekNum = this < yearStarts[1]
						? Math.floor(Math.round((this - yearStarts[0]) / (1000*60*60*24)) / 7) + 1
						: this > yearStarts[2]
						? Math.floor(Math.round((this - yearStarts[2]) / (1000*60*60*24)) / 7) + 1
						: Math.floor(Math.round((this - yearStarts[1]) / (1000*60*60*24)) / 7) + 1;

				return 'w' + '0'.repeat(2 - String(weekNum).length) + weekNum;
			};

		// Store the query and query result
			var query = DA.query.getQuery();
			var queryResult = DA.query.getQueryResult();

		// Ensure the query meets the conditions
			if (Object.keys(query.fields).length === 0) {
				d3.select('#__da-app-content').append('h1').text('Just add data!');
				d3.select('#__da-app-content').append('p').text('Add data in your widget settings to start making magic happen.');
				javascriptAbort();  // Garbage meaningless function to get the widget to stop processing
			}
			else if (!Object.keys(query.fields.dimension).some(function callbackFn(i) { return i.startsWith('DATE_') && i != 'DATE_YEAR' }) || // If a date isn't selected
								Object.keys(query.fields.dimension).length == 1 || // Or if day is the only dimension
								Object.keys(query.fields.metric).length === 0 || // Or if no metrics are selected
								Object.keys(query.fields.metric).length > 4) { // Or if more than four metrics are selected
				d3.select('#__da-app-content').append('h1').text('Requirements not met.');
				var p = d3.select('#__da-app-content').append('p');
				p.append('span').text('Make sure your query includes');
				var ul = p.append('ul');
				ul.append('li').text('day, week, bi-week, month, or quarter;');
				ul.append('li').text('at least one other dimension; and');
				ul.append('li').text('up to four measurements.');
				javascriptAbort();  // Garbage meaningless function to get the widget to stop processing
			}

		// Get metric colours, then set design options
			Promise.all(queryResult.fields.filter(x => x.type == 'metric').map(x => getFieldDetails(x.systemName))).then(fields => {
				var options = [
					{ 'type': 'select',
						'id': 'date',
						'displayName': 'Date Dimension to Pivot',
						'options': queryResult.fields.filter(x => x.systemName.startsWith('DATE_') && x.systemName != 'DATE_YEAR').map(x => { return { 'id': x.systemName, 'label': x.name } }),
						'defaultValue': queryResult.fields.find(x => x.systemName.startsWith('DATE_') && x.systemName != 'DATE_YEAR').systemName },
					{ 'type': 'separator' },
					{ 'type': 'title',
						'displayName': 'Y Axis Scaling Default Choices' },
					{ 'type': 'select',
						'id': 'axesChoice',
						'displayName': 'Axis Independence',
						'options': [{ 'id': 'independent', 'label': 'Independent' }, { 'id': 'synchronised', 'label': 'Synchronised' }],
						'defaultValue': typeof axesChoice == 'undefined' || !['independent', 'synchronised'].includes(axesChoice) ? 'independent' : axesChoice },
					{ 'type': 'select',
						'id': 'barScalingChoice',
						'displayName': 'Scaling Scope',
						'options': [{ 'id': 'local', 'label': 'Local' }, { 'id': 'global', 'label': 'Global' }],
						'defaultValue': typeof barScalingChoice == 'undefined' || !['local', 'global'].includes(barScalingChoice) ? 'local' : barScalingChoice },
					{ 'type': 'separator' },
					{ 'type': 'title',
						'displayName': 'Metric Colours' }
				].concat(fields.map(field => { return {
					'type': 'colorPicker',
					'id': field.systemName,
					'displayName': queryResult.fields.find(x => x.systemName == field.systemName).name,
					'defaultValue': field.color
				}}));

				DA.widget.customDesignSettings.set(options);

		// Get the design settings, then create the widget
				return getDesignSettings();
			}).then(settings => {
				// Validate the date field selection
					settings.date = queryResult.fields.filter(x => x.systemName.startsWith('DATE_')).includes(settings.date) ? settings.date : queryResult.fields.find(x => x.systemName.startsWith('DATE_')).systemName;

				// Set the colour styles, inserted before the custom widget style for backward-compatibility
					d3.select('head').insert('style', '*').text(() => {
						var result = ':root {';
						queryResult.fields.filter(x => x.type == 'metric').forEach((field, i) => {
							result += '--metric' + i + 'colour: ' + settings[field.systemName] + ';';
						});
						result += '}';
						return result;
					});

				// Replace all dates with JavaScript Date objects
					var dateIndex = queryResult.fields.map(x => x.systemName).indexOf(settings.date);

					queryResult.rows.forEach(row => {
						row[dateIndex].value = new Date(row[dateIndex].value);
					});

				// Create an unbroken list of dates and set useful variables
					var minDate = d3.min(queryResult.rows.map(x => x[dateIndex].value));
					var maxDate = d3.max(queryResult.rows.map(x => x[dateIndex].value));
					var dateSpan = Math.round((maxDate - minDate)/(1000*60*60*24));
					var dateList = [];
					var summaryDates;

					switch(settings.date) {
						case 'DATE_DAY':
							for (i = 0; i < dateSpan + 1; i++) {
								dateList.push(new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + i));
							}
							summaryDates = d3.nest()
								.key(d => d.toLocaleString('default', { 'month': 'short' }))
								.entries(dateList);
							break;
						case 'DATE_WEEK':
							for (i = 0; i < (dateSpan / 7) + 1; i++) {
								dateList.push(new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + i * 7));
							}
							summaryDates = d3.nest()
								.key(d => d.toLocaleString('default', { 'month': 'short' }))
								.entries(dateList);
							break;
						case 'DATE_BI_WEEK':
							for (i = 0; i < (dateSpan / 14) + 1; i++) {
								dateList.push(new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + i * 14));
							}
							summaryDates = d3.nest()
								.key(d => d.toLocaleString('default', { 'month': 'short' }))
								.entries(dateList);
							break;
						case 'DATE_MONTH':
							var approxMonths = [];
							for (i = 0; i < (dateSpan / 28) + 1; i++) {
								approxMonths.push(new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + i * 28));
							}
							for (i = 0; i < new Set(approxMonths.map(x => x.getFullYear() + '-' + x.getMonth())).size; i++) {
								dateList.push(new Date(minDate.getFullYear(), minDate.getMonth() + i, minDate.getDate()));
							}
							summaryDates = d3.nest()
								.key(d => d.getFullYear())
								.entries(dateList);
							break;
						case 'DATE_QUARTER':
							var approxQuarters = [];
							for (i = 0; i < (dateSpan / 90) + 1; i++) {
								approxQuarters.push(new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + i * 90));
							}
							for (i = 0; i < new Set(approxQuarters.map(x => x.getFullYear() + '-' + x.getMonth())).size; i++) {
								dateList.push(new Date(minDate.getFullYear(), minDate.getMonth() + i * 3, minDate.getDate()));
							}
							summaryDates = d3.nest()
								.key(d => d.getFullYear())
								.entries(dateList);
							break;
					}

				// Identify the metrics to roll up and the fields by which to group
					var dimFields = [];
					var metricFields = [];

					queryResult.fields.forEach((field, index) => {
						field.index = index;
						if (field.type == 'dimension' && field.systemName != settings.date) {
							dimFields.push(field);
						}
						else if (field.type == 'metric') {
							metricFields.push(field);
						}
					});

				// Create hierarchical groups, forcing Date to the bottom leaf
					var tbodyGrouped = d3.nest();
					
					dimFields.forEach(field => {
						tbodyGrouped = tbodyGrouped.key(d => d[field.index].formattedValue);
					});
					tbodyGrouped = tbodyGrouped.key(d => d[dateIndex].value.getTime());
					tbodyGrouped = tbodyGrouped.rollup(d => metricFields.map(field => { return {
						'metric': field.name,
						'metricIndex': field.index,
						'value': d[0][field.index].value,
						'formattedValue': d[0][field.index].formattedValue
					}}));
					tbodyGrouped = tbodyGrouped.entries(queryResult.rows);

				// Create the document structure
					var viewBlocker = d3.select('#__da-app-content').append('div').attr('id', 'viewblocker');
					var reference = d3.select('#__da-app-content').append('div').attr('id', 'reference');
					var table = d3.select('#__da-app-content').append('div').attr('id', 'table');
					var thead = table.append('div').style('display', 'contents');
					var tbody = table.append('div').style('display', 'contents');
					var tooltip = d3.select('#__da-app-content').append('div').attr('id', 'tooltip').style('opacity', 0);

				// Populate the legend
					reference.append('span')
						.attr('id', 'legend')
						.selectAll('span')
						.data(metricFields)
						.join('span')
							.attr('class', (d, i) => 'metric' + i)
							.text(d => d.name);

				// Specify the table grid layout
					table
					.style('display', 'grid')
					.style('grid-template-columns', 'repeat(' + (dimFields.length + dateList.length) + ', auto)');

				// Populate the table header
					thead.append('div')
						.attr('class', 'colheader blank')
						.style('grid-column', 'auto / span ' + dimFields.length);

					thead.selectAll('div.colheader.summary-date')
					.data(summaryDates)
					.join('div')
						.attr('class', 'colheader summary-date')
						.style('grid-column', d => 'auto / span ' + d.values.length)
						.text(d => d.key);

					thead.selectAll('div.colheader.label')
					.data(dimFields)
					.join('div')
						.attr('class', 'colheader label')
						.style('grid-column', 'auto / auto')
						.text(d => d.name);

					thead.selectAll('div.colheader.date')
					.data(dateList)
					.join('div')
						.attr('class', d => settings.date == 'DATE_DAY' && d.toLocaleString('default', { 'weekday': 'narrow' }) == 'S' ? 'colheader date weekend' : 'colheader date' )
						.style('grid-column', 'auto / auto')
						.text(d => {
							switch(settings.date) {
								case 'DATE_DAY':
									return d.toLocaleString('default', { 'weekday': 'narrow' }) == 'S' ? 'S' : d.getDate();
								case 'DATE_WEEK':
									return d.getWeek();
								case 'DATE_BI_WEEK':
									return d.getWeek();
								case 'DATE_MONTH':
									return d.toLocaleString('default', { 'month': 'short' });
								case 'DATE_QUARTER':
									return d.toLocaleString('default', { 'month': 'short' }) + ' - ' + new Date(d.getFullYear(), d.getMonth() + 3, d.getDate()).toLocaleString('default', { 'month': 'short' });
							}
						});

					// Create and execute a recursive function to populate the table body
						var interpolateShade = d3.interpolateRgb('rgba(255, 255, 255, 0.9)', 'rgba(200, 200, 200, 0.9)');

						function tbodyGenerator(container, children, generation, generations) {
							container.selectAll('div')
							.data(() => {
								var cells = [];
								cellClass = generation < generations - 1 ? 'bodyparent bodylevel' + generation : 'bodychild bodylevel' + generation;
								var rowShade = interpolateShade((generations - 1 - generation) / 9);
								
								children.forEach(child => {
									if (generation > 0) { cells.push({'name': null, 'class': cellClass, 'rowShade': null, 'grid-column': 'auto / span ' + generation}); }
									if (generation < generations - 1) { cells.push({'name': child.key, 'class': cellClass, 'rowShade': rowShade, 'grid-column': 'auto / span ' + (generations - generation + dateList.length), 'children': child.values}); }
									else {
										cells.push({'name': child.key, 'class': cellClass, 'rowShade': null, 'grid-column': 'auto / auto'});
										cells.push({'name': null, 'class': cellClass + ' svg', 'rowShade': null, 'grid-column': 'auto / span ' + dateList.length, 'svgData': child.values});
									}
								});
								return cells;
							})
							.join('div')
								.style('grid-column', d => d['grid-column'])
								.style('background-color', d => d.rowShade)
								.attr('class', d => d.class)
								.attr('title', d => d.name)
								.append('span')
									.text(d => d.name);
							
							if (generation + 1 <= generations - 1) {
								container.selectAll('div[title]').each(function(d) {
									tbodyGenerator(d3.select(this.parentNode).insert('div', 'div[title="' + d.name + '"] + div').attr('class', 'container bodylevel' + generation).style('display', 'contents'), d.children, generation + 1, generations);
								});
							}
						}

						tbodyGenerator(tbody, tbodyGrouped, 0, dimFields.length);

					// Define SVG constants
						var svgHeight = 58; // Pixels
						var svgHeightPadding = 0.9; // Percentage of regular height
						var barGap = 0.5; // Bar-units
						var barWidth = 1 / dateList.length / (metricFields.length + barGap);
						var maxValue = d3.max(metricFields.map(field => d3.max(queryResult.rows, row => row[field.index].value)));

						var lines = 4;
						var gridY = [];
						for (i = 0; i < lines; i++) {
							gridY.push({ 'class': 'gridLine line' + i, 'value': maxValue / lines * i });
						}

					// Create the SVG containers
						var svgRoot = d3.selectAll('.svg').append('svg')
							.attr('transform', 'scale(1, -1)')
							.attr('width', '100%')
							.attr('height', svgHeight + 'px');

						var svg = svgRoot.append('g')
							.attr('transform', 'scale(1, 0)');

						function scaleBarsLocalGlobal(setting, transitionTimer) {
							svg.transition(transitionTimer).attr('transform', d => {
								if (setting == 'global') {
									return 'scale(1, ' + svgHeight * svgHeightPadding / maxValue + ')';
								}
								else if (setting == 'local') {
									return 'scale(1, ' + svgHeight * svgHeightPadding / d3.max(d.svgData.map(x => x.value.map(x => x.value)).flat()) + ')';
								}
							});
						}

						scaleBarsLocalGlobal(settings.barScalingChoice, d3.transition().duration(600));

					// Add hover highlighters
						var focusRects = svgRoot.insert('rect', '*') // Add as the first element
							.attr('class', 'focus-rect')
							.attr('x', '0%')
							.attr('y', '0%')
							.attr('width', 1 / dateList.length * 100 + '%')
							.attr('height', svgHeightPadding * 100 + '%')
							.attr('fill', 'rgba(242, 242, 242, 0)');

					// Draw the grid lines
						var gridLines = svg.selectAll('line')
						.data(gridY)
						.join('line')
							.attr('class', d => d.class)
							.attr('x1', '0%')
							.attr('y1', d => d.value + 'px')
							.attr('x2', '100%')
							.attr('y2', d => d.value + 'px');

					// Create the bar groups and draw the bars
						var barGroups = svg.selectAll('g')
						.data(d => d.svgData)
						.join('g')
							.on('mouseenter', (d, i, nodes) => {
								tooltip.selectAll('div')
								.data(() => [{'name': new Date(parseInt(d.key)).toDateString(), 'class': 'date'}].concat(
									d.value.map((value, i) => { return [{ 'name': value.metric + ': ', 'class': 'metric' + i }, { 'name': value.formattedValue, 'class': null }] })
								))
								.join('div')
									.selectAll('span')
									.data(d => d )
									.join('span')
										.attr('class', d => d.class)
										.text(d => d.name);
								
								var groupProperties = nodes[i].getBoundingClientRect();
								var tooltipProperties = tooltip.node().getBoundingClientRect();
								var dayPosition = dateList.map(x => x.getTime()).indexOf(parseInt(d.key)) / dateList.length;
								var leftAdjust = dayPosition < 0.5 ? 0 : groupProperties.width + tooltipProperties.width;
								
								tooltip
								.style('left', groupProperties.right - leftAdjust + 'px')
								.style('top', groupProperties.bottom - tooltipProperties.height + 'px')
								.transition().style('opacity', 0.9);
								
								focusRects.attr('x', dayPosition * 100 + '%')
								.transition().attr('fill', 'rgba(242, 242, 242, 1)');
							})
							.on('mouseleave', function(d) {
								tooltip.transition().duration(400).style('opacity', 0);
								focusRects.transition().duration(400).attr('fill', 'rgba(242, 242, 242, 0)');
							});
						
						var bars = barGroups.selectAll('rect')
						.data(d => d.value)
						.join('rect')
							.attr('class', (d, i) => 'metric' + i)
							.attr('x', (d, i, nodes) => {
								var dayKey = d3.select(nodes[i].parentNode).datum().key;
								var dayPosition = dateList.map(x => x.getTime()).indexOf(parseInt(dayKey)) / dateList.length;
								return (dayPosition + (i * barWidth) + (barWidth * barGap / 2)) * 100 + '%';
							})
							.attr('y', '0px')
							.attr('width', d => barWidth * 100 + '%')
							.attr('height', d => d.value + 'px');
						
						function changeAxes(setting) {
							if (setting == 'synchronised') {
								bars.transition().duration(600).attr('transform', 'scale(1, 1)');
							}
							else if (setting == 'independent') {
								metricFields.forEach((field, index) => {
									svg.each(function(d) {
										var maxThisLocalMetric = d3.max(d.svgData.map(x => x.value).flat().filter(x => x.metricIndex == field.index), d => d.value);
										var maxAllLocalMetric = d3.max(d.svgData.map(x => x.value.map(x => x.value)).flat());
										var scaleAdjust = String(1 / (maxThisLocalMetric / maxAllLocalMetric)).replace('Infinity', '1');
										d3.select(this).selectAll('.metric' + index).transition().duration(600).attr('transform', 'scale(1, ' + scaleAdjust + ')');
									});
								});
							}
						}

						changeAxes(settings.axesChoice);

					// Create the collapsible controls
						var collapseSpan = d3.selectAll('.bodyparent[title]')
						.insert('span', 'span')
							.attr('class', 'collapsible')
							.on('click', function(d) {
								if (this.parentNode.nextSibling.style.display == 'contents') {
									d3.select(this).select('svg').attr('transform', 'rotate(-90)');
									d3.select(this.parentNode.nextSibling).style('display', 'none');
								}
								else {
									d3.select(this).select('svg').attr('transform', 'rotate(0)');
									d3.select(this.parentNode.nextSibling).style('display', 'contents');
								}
							});
						
						var collapseSVG = collapseSpan.append('svg')
							.attr('width', '12px')
							.attr('viewBox', '0 0 10 6')
							.attr('transform', 'rotate(0)')
							.attr('transform-origin', 'center');
						
						var collapsePath = collapseSVG.append('path')
							.style('fill', 'rgb(156, 160, 160)')
							.attr('d', 'M5.09 5.5a.5.5 0 0 1-.35-.15l-4-4a.5.5 0 0 1 .71-.7l3.64 3.64L8.74.65a.5.5 0 0 1 .71.71l-4 4a.5.5 0 0 1-.36.14z');

					// Create the axis scale control
						var axesControl = reference.append('span')
							.attr('id', 'axescontrol');

						axesControl.append('span')
							.html('Axes:&nbsp;&nbsp;');

						axesControl.append('input')
							.attr('type', 'radio')
							.attr('id', 'synchronised')
							.attr('name', 'axisscale')
							.attr('value', 'synchronised')
							.property('checked', settings.axesChoice == 'synchronised');

						axesControl.append('label')
							.attr('for', 'synchronised')
							.text('Synchronised');

						axesControl.append('span')
							.html('&nbsp;&nbsp;&nbsp;&nbsp;');

						axesControl.append('input')
							.attr('type', 'radio')
							.attr('id', 'independent')
							.attr('name', 'axisscale')
							.attr('value', 'independent')
							.property('checked', settings.axesChoice == 'independent');

						axesControl.append('label')
							.attr('for', 'independent')
							.text('Independent');

					// Create the axis scale transition
						axesControl.selectAll('input')
						.on('change', function() {
							changeAxes(this.value);
						});

					// Create the bar scale control
						var barScaleControl = reference.append('span')
							.attr('id', 'barscalecontrol');

						barScaleControl.append('span')
							.text('Bar scaling scope:  ');

						barScaleControl.append('input')
							.attr('type', 'range')
							.attr('id', 'barscale')
							.attr('min', '-1')
							.attr('max', dimFields.length - 1)
							.attr('value', settings.barScalingChoice == 'global' ? '-1' : dimFields.length - 1);

						barScaleControl.append('span')
							.attr('id', 'barscalelabel')
							.text(settings.barScalingChoice == 'global' ? 'Global' : 'Local');

					// Create the bar scale transitions
						function maxOfDataGroup(data, generation) {
							var expression = 'd3.max(data';
							expression += '.map(x => x.values'.repeat(dimFields.length - generation - 1); // Dig through the right number of levels
							expression += '.map(x => x.value.map(x => x.value))'; // Dig through the day and rollup results
							expression += ')'.repeat(dimFields.length - generation - 1); // Close the right number of brackets
							expression += '.flat()'.repeat(dimFields.length - generation - 1); // Flatten the result the right number of times
							expression += '.flat())'; // Flatten the day and rollup results
							return eval(expression);
						}
						
						var barScaleSlider = barScaleControl.selectAll('input')
						.on('input', function() {
							var sliderValue = this.value;
							var t = d3.transition().duration(600);
							d3.select('#barscalelabel').text(() => {
								if (sliderValue == -1) { return 'Global'; }
								else if (sliderValue == dimFields.length - 1) { return 'Local'; }
								else { return dimFields[sliderValue].name; }
							});
							if (sliderValue == -1) { scaleBarsLocalGlobal('global', d3.transition().duration(600)); }
							else if (sliderValue == dimFields.length - 1) {
								scaleBarsLocalGlobal('local', t);
								d3.selectAll('.bodylevel' + sliderValue + ':nth-child(3n-1)').style('color', 'rgb(59, 136, 253)')
								.transition(t).style('color', 'rgb(0, 0, 0)');
							}
							else {
								d3.selectAll('.container.bodylevel' + sliderValue).each(function() {
									d3.select(this.previousSibling).select('span:nth-child(2)').style('color', 'rgb(59, 136, 253)')
									.transition(t).style('color', 'rgb(0, 0, 0)');
									var maxScopeValue = maxOfDataGroup(d3.select(this.previousSibling).data()[0].children, sliderValue);
									d3.select(this).selectAll('svg > g').transition(t).attr('transform', 'scale(1, ' + svgHeight * svgHeightPadding / maxScopeValue + ')');
								});
							}
						});
			});
	}
};

// Backward compatibility, changed name since it's not necessarily daily anymore
	var dailyBars = barPivot;