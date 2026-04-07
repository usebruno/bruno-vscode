import { forEach } from 'lodash';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

interface MultipartField {
  name: string;
  type?: 'text' | 'file' | string;
  value: string | string[] | Buffer;
  contentType?: string;
}

interface FormDataOptions {
  contentType?: string;
  filename?: string;
}

export const formatMultipartData = (multipartData: MultipartField[], boundary: string): string => {
  if (!Array.isArray(multipartData) || multipartData.length === 0) {
    return '';
  }

  const normalizeBoundary = (b: string): string => {
    const value = b || 'boundary';
    return value.replace(/^--+/, '').replace(/--+$/, '');
  };

  const getFileName = (filePath: string | Buffer): string => {
    if (Buffer.isBuffer(filePath)) {
      return 'buffer';
    }
    if (typeof filePath === 'string' && filePath.trim()) {
      return path.basename(filePath) || 'file';
    }
    return 'file';
  };

  const formatValue = (value: string | string[] | Buffer): string => {
    if (Buffer.isBuffer(value)) {
      return '[Binary Data]';
    }
    if (Array.isArray(value)) {
      return value.map((v) => String(v ?? '')).join(', ');
    }
    return String(value ?? '');
  };

  const boundaryValue = normalizeBoundary(boundary);
  const parts: string[] = [];

  multipartData.forEach((field) => {
    if (!field || !field.name) return;

    parts.push(`----${boundaryValue}`);
    parts.push('Content-Disposition: form-data');

    if (field.type === 'file') {
      if (Buffer.isBuffer(field.value)) {
        parts.push(`----${boundaryValue}`);
        parts.push('Content-Disposition: form-data');
        parts.push(`name: ${field.name}`);
        parts.push(`value: [File: buffer]`);
        parts.push('');
      } else {
        const filePaths = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : ['']);
        filePaths.forEach((filePath) => {
          parts.push(`----${boundaryValue}`);
          parts.push('Content-Disposition: form-data');
          const fileName = getFileName(filePath);
          parts.push(`name: ${field.name}`);
          parts.push(`value: [File: ${fileName}]`);
          parts.push('');
        });
      }
    } else {
      const value = formatValue(field.value);
      parts.push(`name: ${field.name}`);
      parts.push(`value: ${value}`);
      parts.push('');
    }
  });

  parts.push(`----${boundaryValue}--`);
  return parts.join('\n');
};

export const createFormData = (data: MultipartField[], collectionPath: string): FormData => {
  const form = new FormData();

  forEach(data, (datum) => {
    const { name, type, value, contentType } = datum;
    const options: FormDataOptions = {};

    if (contentType) {
      options.contentType = contentType;
    }

    if (type === 'text') {
      if (Array.isArray(value)) {
        value.forEach((val) => form.append(name, val, options));
      } else {
        form.append(name, value, options);
      }
      return;
    }

    if (type === 'file') {
      const filePaths = Array.isArray(value) ? value : [];
      filePaths.forEach((filePath) => {
        let trimmedFilePath = filePath.trim();
        if (!path.isAbsolute(trimmedFilePath)) {
          trimmedFilePath = path.resolve(collectionPath, trimmedFilePath);
        }
        // Prevent path traversal outside the collection directory
        const resolvedPath = path.resolve(trimmedFilePath);
        const resolvedCollectionPath = path.resolve(collectionPath);
        if (!resolvedPath.startsWith(resolvedCollectionPath + path.sep) && resolvedPath !== resolvedCollectionPath) {
          throw new Error(`File path "${filePath}" resolves outside the collection directory`);
        }
        options.filename = path.basename(resolvedPath);
        form.append(name, fs.createReadStream(resolvedPath), options);
      });
    }
  });

  return form;
};
