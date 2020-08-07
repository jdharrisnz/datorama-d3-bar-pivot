var dailyBars = {
  'initialize': function() {
    // Set the defaults
      // Axes
      if (typeof axesChoice == 'undefined') {
        axesChoice = 'independent'; // Options: 'synchronised', 'independent'
      }
    
      // Bar scaling scope
      if (typeof barScalingChoice === 'undefined') {
        barScalingChoice = 'local'; // Options: 'local', 'global'
      }
    
    // Ensure the query meets the conditions
      var query = DA.query.getQuery();
      if (Object.keys(query.fields).length === 0) {
        d3.select('#__da-app-content')
        .html('<h1>Just add data!</h1><p>Add data in your widget settings to start making magic happen.</p>');
        javascriptAbort();  // Garbage meaningless function to get the widget to stop processing
      }
      else if (!('DATE_DAY' in query.fields.dimension) || // If day isn't selected
                 Object.keys(query.fields.dimension).length - 1 === 0 || // Or if day is the only dimension
                 Object.keys(query.fields.metric).length === 0 || // Or if no metrics are selected
                 Object.keys(query.fields.metric).length > 4) { // Or if more than four metrics are selected
        d3.select('#__da-app-content')
        .html('<h1>Requirements not met.</h1><p>Make sure your query includes<ul><li>day;</li><li>at least one other dimension;</li><li>your main measurement; and, optionally</li><li>a comparison measurement (<i>but no more than four total measurements</i>).</li></ul></p>');
        javascriptAbort();  // Garbage meaningless function to get the widget to stop processing
      }
    
    // Store the query result
      var queryResult = DA.query.getQueryResult();
    
    // Replace all dates with JavaScript Date objects
      var dateIndex = queryResult.fields.map(x => x.systemName).indexOf('DATE_DAY');
      
      queryResult.rows.forEach((row, index) => {
        row[dateIndex].value = new Date(row[dateIndex].value);
      });
    
    // Create an unbroken list of dates and set useful variables
      var minDate = d3.min(queryResult.rows.map(x => x[dateIndex].value));
      var maxDate = d3.max(queryResult.rows.map(x => x[dateIndex].value));
      var dateSpan = Math.round((maxDate - minDate)/(1000*60*60*24)) + 1;
      var daysList = [];
      for (i = 0; i < dateSpan; i++) {
        daysList.push(new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + i));
      }
      var months = d3.nest()
        .key(d => d.toLocaleString('default', { month: 'short' }))
        .entries(daysList);
    
    // Identify the metrics to roll up and the fields by which to group
      var dimFields = [];
      var metricFields = [];
      
      queryResult.fields.forEach((field, index) => {
        if (field.type == 'dimension' && field.systemName != 'DATE_DAY') {
          field.index = index;
          dimFields.push(field);
        }
        else if (field.type == 'metric') {
          field.index = index;
          metricFields.push(field);
        }
      });
    
    // Create hierarchical groups, forcing Date to the bottom leaf
      var tbodyGrouped = d3.nest();
      
      dimFields.forEach(field => {
        tbodyGrouped = tbodyGrouped.key(d => d.map(x => x.formattedValue)[field.index]);
      });
      tbodyGrouped = tbodyGrouped.key(d => d.map(x => x.value)[dateIndex].getTime());
      tbodyGrouped = tbodyGrouped.rollup(d => {
        var rollupResult = [];
        metricFields.forEach(field => {
          rollupResult.push({'metric': field.name, 'metricIndex': field.index, 'value': d.map(x => x[field.index].value)[0], 'formattedValue': d.map(x => x[field.index].formattedValue)[0] });
        });
        return rollupResult;
      });
      tbodyGrouped = tbodyGrouped.entries(queryResult.rows);
    
    // Create the document structure
      var viewblocker = d3.select('#__da-app-content').append('div').attr('id', 'viewblocker');
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
    
    // Specify the table layout
      table.style('display', 'grid').style('grid-template-columns', 'repeat(' + (dimFields.length + dateSpan) + ', auto)');
    
    // Populate the table header
      thead.selectAll('div')
      .data(() => {
        var theadData = [];
        theadData.push({'name': null, 'class': 'colheader blank', 'grid-column': 'auto / span ' + dimFields.length});
        months.forEach(month => theadData.push({'name': month.key, 'class': 'colheader month', 'grid-column': 'auto / span ' + month.values.length}));
        dimFields.forEach(field => theadData.push({'name': field.name, 'class': 'colheader label', 'grid-column': 'auto / auto'}));
        daysList.forEach(day => {
          if (day.toLocaleString('default', { weekday: 'narrow' }) == 'S') { theadData.push({'name': 'S', 'class': 'colheader day weekend', 'grid-column': 'auto / auto'}); }
          else { theadData.push({'name': day.getDate(), 'class': 'colheader day', 'grid-column': 'auto / auto'}); }
        });
        return theadData;
      })
      .join('div')
        .style('grid-column', d => d['grid-column'])
        .attr('class', d => d.class)
        .text(d => d.name);
    
    // Create and execute a recursive function to populate the table body
      var interpolateShade = d3.interpolateRgb('rgba(255, 255, 255, 0.9)', 'rgba(200, 200, 200, 0.9)');
      
      function tbodyGenerator(container, children, generation, generations) {
        container.selectAll('div')
        .data(() => {
          var cells = [];
          if (generation < generations - 1) { cellClass = 'bodyparent bodylevel' + generation; }
          else { cellClass = 'bodychild bodylevel' + generation; }
          var rowShade = interpolateShade((generations - 1 - generation) / 9);
          
          children.forEach(child => {
            if (generation > 0) { cells.push({'name': null, 'class': cellClass, 'rowShade': null, 'grid-column': 'auto / span ' + generation}); }
            if (generation < generations - 1) { cells.push({'name': child.key, 'class': cellClass, 'rowShade': rowShade, 'grid-column': 'auto / span ' + (generations - generation + dateSpan), 'children': child.values}); }
            else {
              cells.push({'name': child.key, 'class': cellClass, 'rowShade': null, 'grid-column': 'auto / auto'});
              cells.push({'name': null, 'class': cellClass + ' svg', 'rowShade': null, 'grid-column': 'auto / span ' + dateSpan, 'svgData': child.values});
            }
          });
          return cells;
        })
        .join('div')
          .style('grid-column', d => d['grid-column'])
          .style('background-color', d => d.rowShade)
          .attr('class', d => d.class)
          .attr('title', d => d.name)
          .append('span').text(d => d.name);
        
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
      var barWidth = 1 / dateSpan / (metricFields.length + barGap);
      
      var maxValue = 0;
      metricFields.forEach(field => {
        maxValue = d3.max([maxValue, queryResult.rows.map(x => x[field.index].value)].flat());
      });
      
      var gridY = [];
      var lines = 4;
      for (i = 0; i < lines + 1; i++) {
        gridY.push({'class': 'gridLine line' + i, 'value': maxValue / lines * i});
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
      
      scaleBarsLocalGlobal(barScalingChoice, d3.transition().duration(600));
    
    // Add hover highlighters
      var focusRects = svgRoot.insert('rect', '*') // Add as the first element
        .attr('class', 'focus-rect')
        .attr('x', '0%')
        .attr('y', '0%')
        .attr('width', 1 / dateSpan * 100 + '%')
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
        .on('mouseenter', function(d) {
          tooltip.selectAll('div').data(() => {
            var data = [];
            data.push([{'name': new Date(parseInt(d.key)).toDateString(), 'class': 'date'}]);
            d.value.forEach((value, i) => {
              data.push([{'name': value.metric + ': ', 'class': 'metric' + i}, {'name': value.formattedValue, 'class': null}]);
            });
            return data;
          })
          .join('div')
            .selectAll('span')
            .data(d => d )
            .join('span')
              .attr('class', d => d.class)
              .text(d => d.name);
          
          var groupProperties = this.getBoundingClientRect();
          var tooltipProperties = tooltip.node().getBoundingClientRect();
          var dayPosition = daysList.map(x => x.getTime()).indexOf(parseInt(d.key)) / dateSpan;
          if (dayPosition < 0.5) { leftAdjust = 0; }
          else { leftAdjust = groupProperties.width + tooltipProperties.width; }
          
          tooltip
          .style('left', groupProperties.right - leftAdjust + 'px')
          .style('top', groupProperties.bottom - tooltipProperties.height + 'px');
          
          tooltip.transition().style('opacity', 0.9);
          
          focusRects.attr('x', dayPosition * 100 + '%');
          focusRects.transition().attr('fill', 'rgba(242, 242, 242, 1)');
        })
        .on('mouseleave', function(d) {
          tooltip.transition().duration(400).style('opacity', 0);
          focusRects.transition().duration(400).attr('fill', 'rgba(242, 242, 242, 0)');
        });
      
      barGroups.each(function(d) {
        var dayPosition = daysList.map(x => x.getTime()).indexOf(parseInt(d.key)) / dateSpan;
        d3.select(this)
        .selectAll('rect')
        .data(d => d.value)
        .join('rect')
          .attr('class', (d, i) => 'metric' + i)
          .attr('x', (d, i) => (dayPosition + (i * barWidth) + (barWidth * barGap / 2)) * 100 + '%')
          .attr('y', '0px')
          .attr('width', d => barWidth * 100 + '%')
          .attr('height', d => d.value + 'px');
      });
      var bars = barGroups.selectAll('rect');
      
      function changeAxes(setting) {
        if (setting == 'synchronised') {
          bars.transition().duration(600).attr('transform', 'scale(1, 1)');
        }
        else if (setting == 'independent') {
          metricFields.forEach((field, index) => {
            svg.each(function(d) {
              var maxThisLocalMetric = d3.max(d.svgData.map(x => x.value).flat().filter(x => x.metricIndex == field.index).map(x => x.value));
              var maxAllLocalMetric = d3.max(d.svgData.map(x => x.value.map(x => x.value)).flat());
              var scaleAdjust = String(1 / (maxThisLocalMetric / maxAllLocalMetric)).replace('Infinity', '1');
              d3.select(this).selectAll('.metric' + index).transition().duration(600).attr('transform', 'scale(1, ' + scaleAdjust + ')');
            });
          });
        }
      }
      
      changeAxes(axesChoice);
    
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
        })
        .on('mouseenter', function() {
          d3.select(this).select('svg').select('path').style('fill', 'rgb(10, 135, 198)');
        })
        .on('mouseleave', function() {
          d3.select(this).select('svg').select('path').style('fill', 'rgb(156, 160, 160)');
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
      var axesControl = d3.select('#reference').append('span')
        .attr('id', 'axescontrol')
        .html(() => {
          if (axesChoice == 'synchronised') { return 'Axes:&nbsp;&nbsp;<input type="radio" id="synchronised" name="axisscale" value="synchronised" checked> <label for="synchronised">Synchronised</label>&nbsp;&nbsp;&nbsp;&nbsp;<input type="radio" id="independent" name="axisscale" value="independent"> <label for="independent">Independent</label>'; }
          else if (axesChoice == 'independent') { return 'Axes:&nbsp;&nbsp;<input type="radio" id="synchronised" name="axisscale" value="synchronised"> <label for="synchronised">Synchronised</label>&nbsp;&nbsp;&nbsp;&nbsp;<input type="radio" id="independent" name="axisscale" value="independent" checked> <label for="independent">Independent</label>'; }
        });
    
    // Create the axis scale transition
      axesControl.selectAll('input')
      .on('change', function() {
        changeAxes(this.value);
      });
    
    // Create the bar scale control
      var barScaleControl = d3.select('#reference')
      .append('span')
        .attr('id', 'barscalecontrol')
        .html(() => {
          if (barScalingChoice == 'global') { return 'Bar scaling scope:&nbsp;&nbsp;<input type="range" id="barscale" min="-1" max="' + (dimFields.length - 1) + '" value="-1"> <span id="barscalelabel">Global</span>'; }
          else if (barScalingChoice == 'local') { return 'Bar scaling scope:&nbsp;&nbsp;<input type="range" id="barscale" min="-1" max="' + (dimFields.length - 1) + '" value="' + (dimFields.length - 1) + '"> <span id="barscalelabel">Local</span>'; }
        });
    
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
        d3.select('#barscalelabel').text(() => {
          if (sliderValue == -1) { return 'Global'; }
          else if (sliderValue == dimFields.length - 1) { return 'Local'; }
          else { return dimFields[sliderValue].name; }
        });
        if (sliderValue == -1) { scaleBarsLocalGlobal('global', d3.transition().duration(600)); }
        else if (sliderValue == dimFields.length - 1) {
          var t = d3.transition().duration(600);
          scaleBarsLocalGlobal('local', t);
          d3.selectAll('.bodylevel' + sliderValue + ':nth-child(3n-1)').style('color', 'rgb(59, 136, 253)');
          d3.selectAll('.bodylevel' + sliderValue + ':nth-child(3n-1)').transition(t).style('color', 'rgb(0, 0, 0)');
        }
        else {
          var t = d3.transition().duration(600);
          d3.selectAll('.container.bodylevel' + sliderValue).each(function() {
            d3.select(this.previousSibling).select('span:nth-child(2)').style('color', 'rgb(59, 136, 253)');
            d3.select(this.previousSibling).select('span:nth-child(2)').transition(t).style('color', 'rgb(0, 0, 0)');
            var maxScopeValue = maxOfDataGroup(d3.select(this.previousSibling).data()[0].children, sliderValue);
            d3.select(this).selectAll('svg > g').transition(t).attr('transform', 'scale(1, ' + svgHeight * svgHeightPadding / maxScopeValue + ')');
          });
        }
      });
  }
};
