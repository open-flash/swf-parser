# DefineMorphShape

- Tag Code: `46 = 0x2e`
- SWF version: `3`

## Original documentation

### DefineMorphShape

The DefineMorphShape tag defines the start and end states of a morph sequence. A morph object should be
displayed with the PlaceObject2 tag, where the ratio field specifies how far the morph has progressed.

The minimum file format version is SWF 3.

<table>
<tr>
  <th>Field</th>
  <th>Type</th>
  <th>Comment</th>
</tr>
<tr>
  <td>Header</td>
  <td>RECORDHEADER</td>
  <td>Tag type = 46</td>
</tr>
<tr>
  <td>CharacterId</td>
  <td>UI16</td>
  <td>ID for this character</td>
</tr>
<tr>
  <td>StartBounds</td>
  <td>RECT</td>
  <td>Bounds of the start shape</td>
</tr>
<tr>
  <td>EndBounds</td>
  <td>RECT</td>
  <td>Bounds of the end shape</td>
</tr>
<tr>
  <td>Offset</td>
  <td>UI32</td>
  <td>Indicates offset to EndEdges</td>
</tr>
<tr>
  <td>MorphFillStyles</td>
  <td>MORPHFILLSTYLEARRAY</td>
  <td>
    Fill style information is stored in the same manner as for a
    standard shape; however, each fill consists of interleaved
    information based on a single style type to accommodate
    morphing.
  </td>
</tr>
<tr>
  <td>MorphLineStyles</td>
  <td>MORPHLINESTYLEARRAY</td>
  <td>
    Line style information is stored in the same manner as for a
    standard shape; however, each line consists of interleaved
    information based on a single style type to accommodate
    morphing.
  </td>
</tr>
<tr>
  <td>StartEdges</td>
  <td>SHAPE</td>
  <td>
    Contains the set of edges and the style bits that indicate style
    changes (for example, MoveTo, FillStyle, and LineStyle). Number
    of edges must equal the number of edges in EndEdges.
  </td>
</tr>
<tr>
  <td>EndEdges</td>
  <td>SHAPE</td>
  <td>
    Contains only the set of edges, with no style information.
    Number of edges must equal the number of edges in StartEdges.
  </td>
</tr>
<table>

- StartBounds This defines the bounding-box of the shape at the start of the morph.
- EndBounds - This defines the bounding-box at the end of the morph.
- MorphFillStyles This contains an array of interleaved fill styles for the start and end shapes. The fill style
  for the start shape is followed by the corresponding fill style for the end shape.
- MorphLineStyles - This contains an array of interleaved line styles.
- StartEdges - This array specifies the edges for the start shape, and the style change records for both
  shapes. Because the StyleChangeRecords must be the same for the start and end shapes, they are
  defined only in the StartEdges array.
- EndEdges - This array specifies the edges for the end shape, and contains no style change records. The
  number of edges specified in StartEdges must equal the number of edges in EndEdges.

Strictly speaking, MoveTo records fall into the category of StyleChangeRecords; however, they should be
included in both the StartEdges and EndEdges arrays.

It is possible for an edge to change type over the course of a morph sequence. A straight edge can become a
curved edge and vice versa. In this case, think of both edges as curved. A straight edge can be easily represented
as a curve, by placing the off-curve (control) point at the midpoint of the straight edge, and the on-curve
(anchor) point at the end of the straight edge. The calculation is as follows:

```
CurveControlDelta.x = StraightDelta.x / 2;
CurveControlDelta.y = StraightDelta.y / 2;
CurveAnchorDelta.x = StraightDelta.x / 2;
CurveAnchorDelta.y = StraightDelta.y / 2;
```
