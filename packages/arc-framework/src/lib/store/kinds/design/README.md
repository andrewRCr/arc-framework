# Design content

`readDesignPurpose` reads the first Purpose field in a real Markdown paragraph, bare or in a top-level dash list item.
Continuation lines join through the paragraph's end or the next bold field. The raw value retains empty text and the
`—` placeholder; an absent field returns null. Headings, fenced examples, comments, and HTML blocks carry no field.

The reader serves draft, spec, and companion content. Status applies its own empty-value and opening-sentence
presentation; `codeSpanEnds` preserves inline code while it finds sentence boundaries.
