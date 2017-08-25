Convention (not yet normalized everywhere):
- `*string`: Repeat until end of sequence marker
- `*block`: Repeat until end of stream
- `*list`: Read count and repeat
- `*count`: Number of items
- `*bits`: Can be non-aligned

The grammar is based on EBNF with a Prolog-like predicate logic.

```antlr
matrix : matrixBits PADDING_BITS
matrixBits : TODO
rect : rectBits PADDING_BITS
rectBits : UINT_BITS(5, n) SINT_BITS(n) SINT_BITS(n) SINT_BITS(n) SINT_BITS(n)
sRgb8 : UINT8 UINT8 UINT8

movie : header tagString
header : signature rect UFIXED8U8 UINT16_LE
signature : compressionMethod UINT8 UINT32
compressionMethod : [ '\x46' | '\5a' | '\x43' ] '\x57' '\x53'
tagString : tag * endOfTags
endOfTags : '\x00'
tag :
    tagHeader(1) tags_showFrame
  | tagHeader(2) tags_defineShape
  | tagHeader(9) tags_setBackgroundColor
  | tagHeader(11) tags_defineText
  | tagHeader(84) tags_defineMorphShape2
  | TODO
tagHeader(code) : TODO;
tags_showFrame : ε
tags_defineShape : UINT16_LE rect shape
shape : shapeBits PADDING_BITS
shapeBits : shapeStylesBits(fillBits, lineBits) shapeRecordStringBits(fillBits, lineBits)
shapeStylesBits(fillBits, lineBits) : PADDING_BITS fillStyleList lineStyleList UINT_BITS(4, fillBits) UINT_BITS(4, lineBits)
fillStyleList : listLength fillStyle *
listLength : [ '\x00'..'\xfe' ] | '\xff' UINT16_LE
fillStyle :
    '\x00' solidFillStyle
  | TODO
solidFillStyle : sRgb8
lineStyleList : listLength lineStyle *
lineStyle : UINT16_LE sRgb8 // TODO;
shapeRecordStringBits(fillBits, lineBits) :
    UINT_BITS(6, 0)
  | BOOL_BITS(⊥) styleChangeBits(fillBits, lineBits, nextFillBits, nextLineBits) shapeRecordStringBits(nextFillBits, nextLineBits)
  | BOOL_BITS(⊤) [ BOOL_BITS(⊥) curvedEdgeBits | BOOL_BITS(⊤) straightEdgeBits ] shapeRecordStringBits(fillBits, lineBits)
styleChangeBits(fillBits, lineBits, nextFillBits, nextLineBits) : BOOL_BITS(hasNewStyles) BOOL_BITS(changeLineStyle) BOOL_BITS(changeRightFill) BOOL_BITS(changeLeftFill) BOOL_BITS(hasMoveTo) styleChangeMoveToBits(hasMoveTo) styleIndexBits(changeLeftFill, fillBits) styleIndexBits(changeRightFill, fillBits) styleIndexBits(changeLineStyle, lineBits) newStylesBits(hasNewStyles, fillBits, lineBits, nextFillBits, nextLineBits)
styleChangeMoveToBits(⊥) : ε
styleChangeMoveToBits(⊤) : UINT_BITS(5, n) SINT_BITS(n) SINT_BITS(n)
styleIndexBits(⊥, _) : ε
styleIndexBits(⊤, n) : UINT_BITS(n)
newStylesBits(⊥, fillBits, lineBits, fillBits, lineBits) : ε
newStylesBits(⊤, _, _, nextFillBits, nextLineBits) : shapeStylesBits(nextFillBits, nextLineBits)
curvedEdgeBits : UINT_BITS(4, n) SINT_BITS(n + 2) SINT_BITS(n + 2) SINT_BITS(n + 2) SINT_BITS(n + 2)
straightEdgeBits : UINT_BITS(4, n) [ BOOL_BITS(⊤) SINT_BITS(n + 2) | BOOL_BITS(⊥) BOOL_BITS ] SINT_BITS(n + 2)
tags_setBackgroundColor : sRgb8
tags_defineText : UINT16_LE rect matrix UINT8(indexBits) UINT8(advanceBits) textRecordStringBits(indexBits, advanceBits)
textRecordStringBits(indexBits, advanceBits) : 
    '\x00'
  | textRecordBits(indexBits, advanceBits) textRecordStringBits(indexBits, advanceBits)
textRecordBits(indexBits, advanceBits) : BOOL_BITS(hasFont) BOOL_BITS(hasColor) BOOL_BITS(hasOffsetX) BOOL_BITS(hasOffsetY) textRecordFontId(hasFont) TODO
textRecordFontId(⊥) : ε
textRecordFontId(⊤) : UINT16_LE

tags_defineShape : UINT16_LE rect rect rect rect UINT8  UINT32_LE


```
