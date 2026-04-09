

# eLearning Authoring Tool

## Layout
Three-panel layout with top navigation bar:
- **Top Nav**: Course title, Save button, Preview/Present button, Undo/Redo
- **Left Panel (~250px)**: Toolbox with element buttons (Text, Image, Shape) at top, slide thumbnails list at bottom with Add/Delete slide controls
- **Center**: 16:9 canvas (scaled to fit) showing the active slide's elements
- **Right Panel (~280px)**: Properties panel that dynamically shows fields for the selected element (position, size, content, styling)

## State Management
- Global `Course` state via React Context with useReducer
- Course = array of Slides; each Slide = array of Elements
- Element types: Text, Image, Shape — each with id, type, x, y, width, height, and type-specific content
- Track `activeSlideIndex` and `activeElementId`
- Initialize with one blank slide, no dummy data

## Slide Management
- Bottom of left panel: scrollable slide thumbnail list showing mini previews
- Click thumbnail to switch active slide
- "Add Slide" button appends a new blank slide
- "Delete Slide" button removes active slide (prevents deleting last slide)
- Slide number labels on thumbnails

## Canvas
- Fixed 1920×1080 internal resolution, scaled with CSS transform to fit the center panel
- Render all elements of the active slide
- Use `react-rnd` for drag & resize of elements on canvas
- Position/size changes update global state immediately
- Click canvas background to deselect; click element to select it
- Selected element shows resize handles and a highlight border

## Toolbox (Left Panel Top)
- Buttons: "Add Text", "Add Image", "Add Shape"
- Clicking adds a new element to the center of the active slide with default dimensions
- Image button opens a URL input dialog

## Properties Panel (Right)
- Shows "No element selected" when nothing is active
- For **Text**: editable text content (textarea), font size, font weight, text color, background color
- For **Image**: image URL input, alt text
- For **Shape**: shape type dropdown (rectangle, circle, triangle), fill color, border color, border width
- For **All**: x, y, width, height number inputs
- Changes update global state and canvas in real-time

## Dependencies
- `react-rnd` for drag and resize on canvas

