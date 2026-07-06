# Image Upload & Editing Features

## Overview

This implementation adds drag-and-drop image uploading with editing capabilities (crop & resize) to both the admin dashboard and car detail upload pages. All uploaded images are standardized to **529×319 pixels** for consistency across the platform.

## Features

### 1. **Admin Upload Page** (`admin-upload.html`)
- **Drag & Drop Interface**: Click or drag image files into the upload zone
- **Automatic Upload**: Images are automatically uploaded to the server upon selection
- **Edit Capability**: Click on uploaded image thumbnail to crop/resize to 529×319px
- **Error Handling**: Validation for file type and size with user-friendly error messages
- **Real-time Preview**: Shows image preview with edit and remove buttons

#### Usage:
1. Navigate to the admin dashboard
2. Find the "Image Upload" section in the Card Details form
3. Drag and drop an image or click to browse
4. Optionally click the thumbnail to edit/crop the image
5. The image path will be automatically populated
6. Continue filling other car details and save

### 2. **Car Detail Upload Page** (`car-detail-upload.html`)
- **Drag & Drop Interface**: Upload multiple images at once
- **Image Editing Modal**: Click any image to open the editor
- **Crop & Resize**: Interactive crop tool with zoom and pan controls
- **Live Preview**: See images in preview grid with 529×319px aspect ratio
- **Batch Processing**: All images are standardized to 529×319px

#### Usage:
1. Navigate to Car Details upload
2. In the "Place Images" section, drag and drop image files
3. Click any thumbnail to open the image editor modal
4. Use the editor controls:
   - **🔍+** : Zoom In (1.2x)
   - **🔍−** : Zoom Out (0.8x)
   - **↻** : Reset to original crop
   - **✓** : Apply crop
   - **Pan**: Click and drag within the canvas to adjust crop area
5. Click "Apply" to save the edited image
6. First image automatically becomes primary image
7. Fill car details and upload

### 3. **Image Editor Modal**
Located in `image-editor.js`, provides:

#### ImageEditor Class
- `loadImage(input)`: Load image from File or URL
- `getCanvas()`: Get edited canvas (529×319px)
- `getBlob()`: Export as JPEG blob
- `getDataURL()`: Export as data URL
- `zoom(factor)`: Zoom in/out
- `pan(deltaX, deltaY)`: Move crop area
- `reset()`: Reset to initial state
- `setCrop(x, y, width, height)`: Set specific crop area

#### ImageCropPreview Class
- Interactive UI wrapper for ImageEditor
- Touch & mouse support
- Drag to pan, buttons to zoom/reset

#### showImageEditorModal Function
```javascript
const result = await showImageEditorModal(fileOrUrl, {
  targetWidth: 529,
  targetHeight: 319
});
// result contains: { dataUrl, blob, canvas }
```

## Technical Details

### Standard Image Dimensions
- **Width**: 529 pixels
- **Height**: 319 pixels
- **Aspect Ratio**: 1.66:1
- **Format**: JPEG (85% quality)

### File Upload Flow

**Admin Upload:**
```
User selects image → Upload to server → Get file path → Store in form → Editor available
```

**Car Detail Upload:**
```
User drops images → Store in memory → User can edit each → Edit creates JPEG blob → Upload with form
```

### API Endpoints Used

1. **Image Upload**
   ```
   POST /upload/image
   Headers: Authorization: Bearer {token}
   Body: FormData with file
   Response: { img: "path/to/uploaded/image.jpg" }
   ```

2. **Car Details**
   ```
   POST/PUT /api/car-details
   Body: { name, make, model, ..., img, images: [...] }
   ```

## Error Handling

- **Authentication**: Auto-refresh tokens if upload fails with 401/403
- **Invalid Files**: Show error toast if non-image file selected
- **Upload Failures**: Display server error message to user
- **Network Issues**: "Server unreachable" message with suggestion to retry

## Browser Compatibility

- **Canvas API**: All modern browsers
- **File API**: Required for file handling
- **Drag & Drop**: Optional - falls back to file input
- **Touch Events**: Supported for mobile image editing

## Performance Considerations

1. **Image Compression**: JPEG 85% quality balances file size and visual fidelity
2. **Lazy Loading**: Edited images stored in memory until upload
3. **Canvas Rendering**: Only rendered when needed (crop/zoom operations)
4. **Memory**: FileReader API used for local processing before upload

## Future Enhancements

- [ ] Batch image optimization on server
- [ ] Image filters (brightness, contrast, saturation)
- [ ] Rotation support
- [ ] Multiple crop presets for different page locations
- [ ] Image CDN integration
- [ ] Thumbnail generation service
- [ ] WebP format support for better compression

## Troubleshooting

### Images not uploading
- Check browser console for errors
- Verify API server is running (port 8000)
- Ensure admin authentication token is valid
- Check file size limits

### Editor modal not appearing
- Verify `image-editor.js` is loaded
- Check browser console for JavaScript errors
- Ensure image file is valid

### Crop dimensions incorrect
- Editor always maintains 529×319 aspect ratio
- Pan and zoom to adjust visible area
- Use "Reset" button to start over

## Code Structure

```
image-editor.js
├── ImageEditor (Core editing class)
├── ImageCropPreview (UI wrapper)
└── showImageEditorModal (Modal controller)

Admin.js (admin-upload.html)
├── initAdminImageDrop() - Setup drag/drop
├── editAdminImage() - Open editor
└── clearAdminImage() - Clear selection

car-detail-upload.js (car-detail-upload.html)
├── handleFiles() - Process dropped files
├── editImage() - Open editor for thumbnail
└── updateImgPathDisplay() - Show image status
```

## Security Notes

- File type validation on client-side (image/* MIME types)
- Server-side file upload validation required
- Token-based authentication for uploads
- Data URLs used temporarily; recommend server-side storage
- XSS protection: HTML entities escaped in display

---

**Last Updated**: 2026-07-06
**Version**: 1.0
