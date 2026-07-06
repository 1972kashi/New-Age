/**
 * Image Editor Module
 * Handles image cropping, resizing, and canvas manipulation
 */

class ImageEditor {
  constructor(options = {}) {
    this.canvas = null;
    this.ctx = null;
    this.image = null;
    this.imageFile = null;
    this.scale = options.scale || 1;
    this.rotation = options.rotation || 0;
    this.cropX = 0;
    this.cropY = 0;
    this.cropWidth = 0;
    this.cropHeight = 0;
    this.targetWidth = options.targetWidth || 529;
    this.targetHeight = options.targetHeight || 319;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /**
   * Load image from File object or URL
   */
  loadImage(input) {
    return new Promise((resolve, reject) => {
      if (input instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.imageFile = input;
          const img = new Image();
          img.onload = () => {
            this.image = img;
            this._initializeCrop();
            resolve(img);
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(input);
      } else if (typeof input === 'string') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.image = img;
          this._initializeCrop();
          resolve(img);
        };
        img.onerror = reject;
        img.src = input;
      } else {
        reject(new Error('Invalid input'));
      }
    });
  }

  /**
   * Initialize crop area to fill target aspect ratio
   */
  _initializeCrop() {
    const aspect = this.targetWidth / this.targetHeight;
    const imgAspect = this.image.width / this.image.height;

    if (imgAspect > aspect) {
      // Image is wider than target - crop width
      this.cropHeight = this.image.height;
      this.cropWidth = this.cropHeight * aspect;
    } else {
      // Image is taller than target - crop height
      this.cropWidth = this.image.width;
      this.cropHeight = this.cropWidth / aspect;
    }

    this.cropX = (this.image.width - this.cropWidth) / 2;
    this.cropY = (this.image.height - this.cropHeight) / 2;
  }

  /**
   * Get canvas with edited image
   */
  getCanvas() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
    }
    this.canvas.width = this.targetWidth;
    this.canvas.height = this.targetHeight;
    this.ctx = this.canvas.getContext('2d');

    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(
        this.image,
        this.cropX,
        this.cropY,
        this.cropWidth,
        this.cropHeight,
        0,
        0,
        this.targetWidth,
        this.targetHeight
      );
    }

    return this.canvas;
  }

  /**
   * Export as Blob
   */
  getBlob(quality = 0.85) {
    return new Promise((resolve, reject) => {
      this.getCanvas().toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        'image/jpeg',
        quality
      );
    });
  }

  /**
   * Export as data URL
   */
  getDataURL(quality = 0.85) {
    return this.getCanvas().toDataURL('image/jpeg', quality);
  }

  /**
   * Set crop coordinates
   */
  setCrop(x, y, width, height) {
    this.cropX = Math.max(0, Math.min(x, this.image.width - width));
    this.cropY = Math.max(0, Math.min(y, this.image.height - height));
    this.cropWidth = Math.min(width, this.image.width - this.cropX);
    this.cropHeight = Math.min(height, this.image.height - this.cropY);
  }

  /**
   * Zoom in/out
   */
  zoom(factor) {
    this.scale *= factor;
    this.scale = Math.max(0.1, Math.min(this.scale, 5));
    
    const centerX = this.cropX + this.cropWidth / 2;
    const centerY = this.cropY + this.cropHeight / 2;
    
    const newWidth = (this.image.width / this.scale) * (this.targetWidth / this.targetHeight);
    const newHeight = this.image.height / this.scale;
    
    this.cropWidth = newWidth;
    this.cropHeight = newHeight;
    this.cropX = centerX - this.cropWidth / 2;
    this.cropY = centerY - this.cropHeight / 2;
    
    this._constrainCrop();
  }

  /**
   * Pan the crop area
   */
  pan(deltaX, deltaY) {
    this.cropX -= deltaX;
    this.cropY -= deltaY;
    this._constrainCrop();
  }

  /**
   * Constrain crop to image bounds
   */
  _constrainCrop() {
    this.cropX = Math.max(0, Math.min(this.cropX, this.image.width - this.cropWidth));
    this.cropY = Math.max(0, Math.min(this.cropY, this.image.height - this.cropHeight));
  }

  /**
   * Reset to initial state
   */
  reset() {
    this._initializeCrop();
    this.scale = 1;
    this.rotation = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}

/**
 * Interactive Image Crop Preview
 */
class ImageCropPreview {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    this.editor = new ImageEditor(options);
    this.canvas = null;
    this.previewCanvas = null;
    this.isDragging = false;
    this.dragMode = null; // 'pan' or 'resize'
    this.startX = 0;
    this.startY = 0;

    this._setupUI();
  }

  _setupUI() {
    this.container.innerHTML = `
      <div class="crop-preview-wrapper">
        <div class="crop-canvas-container">
          <canvas class="crop-canvas" id="cropCanvas"></canvas>
          <div class="crop-frame" id="cropFrame"></div>
        </div>
        <div class="crop-controls">
          <button type="button" class="crop-btn" id="cropZoomIn" title="Zoom In">🔍+</button>
          <button type="button" class="crop-btn" id="cropZoomOut" title="Zoom Out">🔍−</button>
          <button type="button" class="crop-btn" id="cropReset" title="Reset">↻</button>
          <button type="button" class="crop-btn" id="cropApply" title="Apply Crop">✓</button>
        </div>
      </div>
      <style>
        .crop-preview-wrapper {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .crop-canvas-container {
          position: relative;
          background: var(--dark-2, #141619);
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          border-radius: 8px;
          overflow: hidden;
          max-width: 100%;
          aspect-ratio: 529 / 319;
        }
        .crop-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }
        .crop-frame {
          position: absolute;
          inset: 0;
          border: 2px solid var(--gold, #D4A017);
          pointer-events: none;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
        }
        .crop-controls {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .crop-btn {
          padding: 8px 16px;
          background: var(--gold, #D4A017);
          color: #000;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 700;
          font-size: 12px;
          transition: all 0.2s;
        }
        .crop-btn:hover {
          background: var(--gold-light, #e8b830);
          transform: translateY(-2px);
        }
        .crop-btn:active {
          transform: translateY(0);
        }
      </style>
    `;

    this.previewCanvas = document.getElementById('cropCanvas');
    this.cropFrame = document.getElementById('cropFrame');

    document.getElementById('cropZoomIn').onclick = () => this.zoom(1.2);
    document.getElementById('cropZoomOut').onclick = () => this.zoom(0.8);
    document.getElementById('cropReset').onclick = () => this.reset();
    document.getElementById('cropApply').onclick = () => this.apply();

    this.previewCanvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    document.addEventListener('mousemove', (e) => this._onMouseMove(e));
    document.addEventListener('mouseup', () => this._onMouseUp());

    // Touch support
    this.previewCanvas.addEventListener('touchstart', (e) => this._onTouchStart(e));
    document.addEventListener('touchmove', (e) => this._onTouchMove(e));
    document.addEventListener('touchend', () => this._onTouchEnd());
  }

  _onMouseDown(e) {
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.dragMode = 'pan';
  }

  _onMouseMove(e) {
    if (!this.isDragging || !this.dragMode) return;

    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;

    if (this.dragMode === 'pan') {
      const rect = this.previewCanvas.getBoundingClientRect();
      const scaleX = this.editor.image.width / rect.width;
      const scaleY = this.editor.image.height / rect.height;
      this.editor.pan(deltaX * scaleX, deltaY * scaleY);
      this.render();
    }

    this.startX = e.clientX;
    this.startY = e.clientY;
  }

  _onMouseUp() {
    this.isDragging = false;
    this.dragMode = null;
  }

  _onTouchStart(e) {
    if (e.touches.length === 1) {
      this._onMouseDown(e.touches[0]);
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 1) {
      this._onMouseMove(e.touches[0]);
    }
  }

  _onTouchEnd() {
    this._onMouseUp();
  }

  zoom(factor) {
    this.editor.zoom(factor);
    this.render();
  }

  reset() {
    this.editor.reset();
    this.render();
  }

  async apply() {
    if (this.onApply) {
      const dataUrl = this.editor.getDataURL();
      const blob = await this.editor.getBlob();
      this.onApply({ dataUrl, blob, canvas: this.editor.getCanvas() });
    }
  }

  render() {
    if (!this.editor.image || !this.previewCanvas) return;

    const canvas = this.editor.getCanvas();
    const ctx = this.previewCanvas.getContext('2d');

    this.previewCanvas.width = 529;
    this.previewCanvas.height = 319;

    ctx.drawImage(canvas, 0, 0);
  }

  async loadImage(input) {
    await this.editor.loadImage(input);
    this.render();
  }
}

/**
 * Modal wrapper for image editor
 */
function showImageEditorModal(imageFile, options = {}) {
  return new Promise((resolve, reject) => {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: var(--dark-card, #1e2128);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 8px;
      padding: 28px;
      max-width: 700px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
    `;

    const header = document.createElement('h2');
    header.textContent = 'Crop & Resize Image';
    header.style.cssText = `
      margin: 0 0 20px 0;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 24px;
      letter-spacing: 1.5px;
      color: var(--text, #f0f0f0);
    `;

    const previewContainer = document.createElement('div');
    previewContainer.id = 'imageEditorPreview';
    previewContainer.style.cssText = 'margin-bottom: 20px;';

    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 20px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: var(--dark-2, #141619);
      color: var(--text, #f0f0f0);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 4px;
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Apply';
    confirmBtn.style.cssText = `
      padding: 10px 20px;
      background: var(--gold, #D4A017);
      color: #000;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
    `;

    content.appendChild(header);
    content.appendChild(previewContainer);
    content.appendChild(buttonsContainer);
    buttonsContainer.appendChild(cancelBtn);
    buttonsContainer.appendChild(confirmBtn);

    modal.appendChild(content);
    document.body.appendChild(modal);

    const preview = new ImageCropPreview('imageEditorPreview', {
      targetWidth: options.targetWidth || 529,
      targetHeight: options.targetHeight || 319
    });

    preview.loadImage(imageFile).then(() => {
      preview.render();
    }).catch(reject);

    cancelBtn.onclick = () => {
      modal.remove();
      reject(new Error('User cancelled'));
    };

    confirmBtn.onclick = () => {
      preview.apply();
    };

    preview.onApply = (result) => {
      modal.remove();
      resolve(result);
    };
  });
}
