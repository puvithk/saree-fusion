import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUploadCloud, FiX, FiImage } from 'react-icons/fi';
import { HiOutlineSparkles } from 'react-icons/hi';
import sareesilhouette from '../assets/saree-silhouette.png';
import { API_BASE_URL } from '../config';

import redSaree from '../assets/red-saree.png';
import silkSaree from '../assets/silk-saree.png';
import cottonSaree from '../assets/cotton-saree.png';
import traditionalSaree from '../assets/traditional-saree.png';
import bridalSaree from '../assets/bridal-saree.png';

const COMPONENT_TYPES = [
  { key: 'pallu', label: 'Pallu Images', description: 'Upload pallu designs for your saree', maxFiles: 5 },
  { key: 'border', label: 'Border Images', description: 'Upload border patterns for your saree', maxFiles: 5 },
  { key: 'body', label: 'Body Images', description: 'Upload body fabric designs for your saree', maxFiles: 5 },
];

const STYLES = {
  normal: {
    label: 'Normal Style',
    models: [
      { id: 'model_1', name: 'Model A (Classic Red)', image: redSaree },
      { id: 'model_2', name: 'Model B (Silk Drape)', image: silkSaree },
      { id: 'model_3', name: 'Model C (Cotton Drape)', image: cottonSaree },
    ],
  },
  mysore: {
    label: 'Mysore Style',
    models: [
      { id: 'model_1', name: 'Model A (Traditional)', image: traditionalSaree },
      { id: 'model_2', name: 'Model B (Bridal Zari)', image: bridalSaree },
      { id: 'model_3', name: 'Model C (Silk Drape)', image: silkSaree },
    ],
  },
  kadagu: {
    label: 'Kadagu Style',
    models: [
      { id: 'model_1', name: 'Model A (Cotton Drape)', image: cottonSaree },
      { id: 'model_2', name: 'Model B (Traditional)', image: traditionalSaree },
      { id: 'model_3', name: 'Model C (Bridal Zari)', image: bridalSaree },
    ],
  },
};

function UploadCard({ type, files, onFilesAdd, onFileRemove }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (droppedFiles.length > 0) {
      onFilesAdd(droppedFiles);
    }
  };

  const handleInputChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      onFilesAdd(selectedFiles);
    }
    e.target.value = '';
  };

  return (
    <div className="upload-card">
      <div className="upload-card-header">
        <div className="upload-card-icon">
          <FiImage />
        </div>
        <div>
          <h3 className="upload-card-title">{type.label}</h3>
          <p className="upload-card-desc">{type.description}</p>
        </div>
      </div>

      <div className="upload-card-count">
        <span>{files.length}</span> / {type.maxFiles} uploaded
      </div>

      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${files.length >= type.maxFiles ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => files.length < type.maxFiles && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleInputChange}
          className="upload-input-hidden"
        />
        <div className="dropzone-icon">
          <FiUploadCloud />
        </div>
        <p className="dropzone-text">
          Drag & drop images here
        </p>
        <p className="dropzone-subtext">or</p>
        <span className="dropzone-browse-btn">Browse Files</span>
        <p className="dropzone-format">PNG, JPG, WEBP up to 5MB</p>
      </div>

      {files.length > 0 && (
        <div className="upload-previews">
          {files.map((file, i) => (
            <div key={i} className="upload-preview-item">
              <img src={file.preview} alt={file.name} className="preview-thumb" />
              <div className="preview-info">
                <span className="preview-label">{type.key.charAt(0).toUpperCase()}{i + 1}</span>
              </div>
              <button
                className="preview-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemove(i);
                }}
                aria-label={`Remove ${file.name}`}
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Design() {
  const navigate = useNavigate();
  const [uploads, setUploads] = useState({
    pallu: [],
    border: [],
    body: [],
  });
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('normal'); // 'normal' | 'mysore' | 'kadagu'
  const [selectedModel, setSelectedModel] = useState('model_1'); // 'model_1' | 'model_2' | 'model_3'

  const handleStyleChange = (style) => {
    setSelectedStyle(style);
    setSelectedModel('model_1');
  };

  const handleFilesAdd = (key, newFiles) => {
    const type = COMPONENT_TYPES.find((t) => t.key === key);
    const remaining = type.maxFiles - uploads[key].length;
    const filesToAdd = newFiles.slice(0, remaining).map((file) => ({
      file,
      name: file.name,
      preview: URL.createObjectURL(file),
    }));
    setUploads((prev) => ({
      ...prev,
      [key]: [...prev[key], ...filesToAdd],
    }));
  };

  const handleFileRemove = (key, index) => {
    setUploads((prev) => {
      const updated = [...prev[key]];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return { ...prev, [key]: updated };
    });
  };

  const totalUploads = uploads.pallu.length + uploads.border.length + uploads.body.length;
  const canGenerate = uploads.pallu.length > 0 || uploads.border.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate || isGenerating) return;
    setIsGenerating(true);
    try {
      const formData = new FormData();
      uploads.pallu.forEach((item) => formData.append('pallu', item.file));
      uploads.border.forEach((item) => formData.append('border', item.file));
      uploads.body.forEach((item) => formData.append('body', item.file));
      formData.append('description', description);
      formData.append('style', selectedStyle);
      formData.append('model', selectedModel);

      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to generate fusion design');
      }

      const data = await response.json();
      navigate(`/collections/batch/${data.id}`);
    } catch (err) {
      console.error(err);
      alert('Error generating design fusion. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="design-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            Design Your <span className="text-cyan">Saree</span>
          </h1>
          <p className="page-subtitle">
            Upload your saree components to create unique fusion designs
          </p>
        </div>
        <div className="page-header-decor">
          <img src={sareesilhouette} alt="" className="decor-silhouette" />
        </div>
      </div>

      {/* Steps indicator */}
      <div className="design-steps">
        <div className="design-step active">
          <div className="step-number">1</div>
          <span className="step-label">Upload Components</span>
        </div>
        <div className="step-connector active" />
        <div className="design-step active">
          <div className="step-number">2</div>
          <span className="step-label">Select Style & Model</span>
        </div>
        <div className="step-connector active" />
        <div className="design-step active">
          <div className="step-number">3</div>
          <span className="step-label">Describe & Generate</span>
        </div>
      </div>

      {/* Upload Cards */}
      <div className="upload-grid">
        {COMPONENT_TYPES.map((type) => (
          <UploadCard
            key={type.key}
            type={type}
            files={uploads[type.key]}
            onFilesAdd={(files) => handleFilesAdd(type.key, files)}
            onFileRemove={(index) => handleFileRemove(type.key, index)}
          />
        ))}
      </div>

      {/* Summary bar */}
      <div className="upload-summary">
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="summary-stat-value">{uploads.pallu.length}</span>
            <span className="summary-stat-label">Pallu</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-stat">
            <span className="summary-stat-value">{uploads.border.length}</span>
            <span className="summary-stat-label">Border</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-stat">
            <span className="summary-stat-value">{uploads.body.length}</span>
            <span className="summary-stat-label">Body</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-stat total">
            <span className="summary-stat-value">{totalUploads}</span>
            <span className="summary-stat-label">Total</span>
          </div>
        </div>
      </div>

      {/* Style & Model Selection Section */}
      <div className="style-selection-section">
        <h3 className="design-desc-title">Step 2: Select Saree Draping Style & Model</h3>
        <p className="design-desc-hint" style={{ marginBottom: '16px' }}>Choose the style format (Kadagu, Mysore, Normal) and target silhouette model</p>
        
        <div className="style-tabs">
          {Object.entries(STYLES).map(([key, styleObj]) => (
            <button
              key={key}
              type="button"
              className={`style-tab-btn ${selectedStyle === key ? 'active' : ''}`}
              onClick={() => handleStyleChange(key)}
            >
              {styleObj.label}
            </button>
          ))}
        </div>

        <div className="model-grid">
          {STYLES[selectedStyle].models.map((model) => (
            <div
              key={model.id}
              className={`model-card ${selectedModel === model.id ? 'active' : ''}`}
              onClick={() => setSelectedModel(model.id)}
            >
              <div className="model-img-wrapper">
                <img src={model.image} alt={model.name} className="model-preview-img" />
                {selectedModel === model.id && (
                  <div className="model-selected-badge">Selected</div>
                )}
              </div>
              <span className="model-name">{model.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="design-description-section">
        <h3 className="design-desc-title">Design Description</h3>
        <p className="design-desc-hint">Describe the saree design you want to generate (optional)</p>
        <textarea
          className="design-description-textarea"
          placeholder="E.g., A royal red Banarasi silk saree with intricate gold zari borders and peacock motifs on the pallu..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>

      {/* Generate Button */}
      <div className="design-generate-section">
        <button
          className={`generate-fusion-btn ${(!canGenerate || isGenerating) ? 'disabled' : ''}`}
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
        >
          <HiOutlineSparkles /> {isGenerating ? 'Generating...' : 'Generate Fusion'}
        </button>
        {!canGenerate && (
          <p className="generate-hint">Upload at least one Pallu or Border image to generate</p>
        )}
      </div>
    </div>
  );
}
