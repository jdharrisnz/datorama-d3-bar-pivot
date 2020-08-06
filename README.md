# datorama-d3-daily-bars-many-dimensions
Custom widget for Datorama. Visualises up to four metrics, daily, over many dimensions.

This custom widget creates separate partitions for each dimension you add, and visualises up to four measurements in each day. Mouseover a day for exact figures, explore your data with the controls at the top, and collapse hierarchies you don't need to see.

![Preview image](image.png)

## Preferences
Set the defaults for settings at the top by adding this code to the beginning of the JS section of the Custom Widget Editor:
```
var axesChoice = 'independent'; // Options: 'synchronised', 'independent'
var barScalingChoice = 'local'; // Options: 'local', 'global'
```

## Common Style Changes
### Change the colours of the bars of each individual metric
To change the metric colours,  add this to the CSS section of the Custom Widget Editor. The variables set here will affect every related use of those colours.
```
:root {
  --metric0colour: rgb(188, 228, 216);
  --metric1colour: rgb(110, 184, 197);
  --metric2colour: rgb(53, 137, 169);
  --metric3colour: rgb(44, 89, 133);
}
```

## Set up and Dependencies
Add `dailyBars.initialize()` to the JS section, and add the below dependencies to the second tab of the Custom Widget Editor.

Script dependencies (must be loaded in this order):
1. https://d3js.org/d3.v5.min.js
2. https://drive.google.com/uc?export=view&id=139Xos2xMKLOHM59BANTsXz-RglTAnNPr

Style dependency:
1. https://drive.google.com/uc?export=view&id=1xxNh1KFg60eODZlZWZ6l8pF4kN_7y0Dq
