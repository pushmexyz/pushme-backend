import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../utils/logger';
import { uploadFile } from '../utils/fileStorage';
import { supabase } from '../config/supabase';
import { config } from '../config/env';
import { DonationType, DonationMetadata } from '../types/DonationTypes';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const MAX_FILE_SIZE = config.media.maxFileSizeMB * 1024 * 1024; // Convert to bytes

export interface ProcessedMedia {
  buffer: Buffer;
  contentType: string;
  metadata: DonationMetadata;
  fileName: string;
}

export async function processImage(
  fileBuffer: Buffer,
  fileName: string
): Promise<ProcessedMedia | null> {
  try {
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      logger.error('Invalid image metadata');
      return null;
    }

    // Resize if too large
    let processedBuffer = fileBuffer;
    if (metadata.width > config.media.maxImageWidth) {
      processedBuffer = await image
        .resize(config.media.maxImageWidth, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      // Optimize existing image
      processedBuffer = await image.jpeg({ quality: 85 }).toBuffer();
    }

    const finalMetadata = await sharp(processedBuffer).metadata();

    return {
      buffer: processedBuffer,
      contentType: 'image/jpeg',
      metadata: {
        width: finalMetadata.width,
        height: finalMetadata.height,
        size: processedBuffer.length,
        filetype: 'image/jpeg',
      },
      fileName: path.basename(fileName, path.extname(fileName)) + '.jpg',
    };
  } catch (error) {
    logger.error('Error processing image:', error);
    return null;
  }
}

export async function processGif(
  fileBuffer: Buffer,
  fileName: string
): Promise<ProcessedMedia | null> {
  try {
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      logger.error('Invalid GIF metadata');
      return null;
    }

    // Resize if too large
    let processedBuffer = fileBuffer;
    if (metadata.width > config.media.maxGifWidth) {
      processedBuffer = await image
        .resize(config.media.maxGifWidth, null, { withoutEnlargement: true })
        .gif()
        .toBuffer();
    }

    if (processedBuffer.length > MAX_FILE_SIZE) {
      logger.error('GIF too large after processing');
      return null;
    }

    return {
      buffer: processedBuffer,
      contentType: 'image/gif',
      metadata: {
        width: metadata.width,
        height: metadata.height,
        size: processedBuffer.length,
        filetype: 'image/gif',
      },
      fileName,
    };
  } catch (error) {
    logger.error('Error processing GIF:', error);
    return null;
  }
}

export async function processAudio(
  fileBuffer: Buffer,
  fileName: string
): Promise<ProcessedMedia | null> {
  return new Promise((resolve) => {
    try {
      // Write buffer to temp file for ffmpeg
      const tempInput = path.join('/tmp', `input_${Date.now()}_${fileName}`);
      const tempOutput = path.join('/tmp', `output_${Date.now()}.mp3`);

      fs.writeFileSync(tempInput, fileBuffer);

      ffmpeg(tempInput)
        .toFormat('mp3')
        .audioCodec('libmp3lame')
        .audioBitrate(128)
        .on('end', async () => {
          try {
            const outputBuffer = fs.readFileSync(tempOutput);
            const duration = await getAudioDuration(tempOutput);

            if (duration > config.media.maxAudioDuration) {
              logger.error(`Audio duration ${duration}s exceeds limit`);
              cleanup([tempInput, tempOutput]);
              resolve(null);
              return;
            }

            cleanup([tempInput, tempOutput]);

            resolve({
              buffer: outputBuffer,
              contentType: 'audio/mpeg',
              metadata: {
                duration,
                size: outputBuffer.length,
                filetype: 'audio/mpeg',
              },
              fileName: path.basename(fileName, path.extname(fileName)) + '.mp3',
            });
          } catch (error) {
            logger.error('Error processing audio output:', error);
            cleanup([tempInput, tempOutput]);
            resolve(null);
          }
        })
        .on('error', (err: Error) => {
          logger.error('FFmpeg error processing audio:', err);
          cleanup([tempInput, tempOutput]);
          resolve(null);
        })
        .save(tempOutput);
    } catch (error) {
      logger.error('Error processing audio:', error);
      resolve(null);
    }
  });
}

export async function processVideo(
  fileBuffer: Buffer,
  fileName: string
): Promise<ProcessedMedia | null> {
  return new Promise((resolve) => {
    try {
      const tempInput = path.join('/tmp', `input_${Date.now()}_${fileName}`);
      const tempOutput = path.join('/tmp', `output_${Date.now()}.mp4`);
      const tempThumbnail = path.join('/tmp', `thumb_${Date.now()}.jpg`);

      fs.writeFileSync(tempInput, fileBuffer);

      // First, get duration
      ffmpeg(tempInput)
        .ffprobe((err, data) => {
          if (err) {
            logger.error('Error probing video:', err);
            cleanup([tempInput]);
            resolve(null);
            return;
          }

          const duration = data.format.duration || 0;
          if (duration > config.media.maxVideoDuration) {
            logger.error(`Video duration ${duration}s exceeds limit`);
            cleanup([tempInput]);
            resolve(null);
            return;
          }

          // Process video
          ffmpeg(tempInput)
            .toFormat('mp4')
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions(['-preset fast', '-crf 23'])
            .on('end', async () => {
              try {
                const outputBuffer = fs.readFileSync(tempOutput);
                
                // Generate thumbnail
                await new Promise<void>((resolveThumb) => {
                  ffmpeg(tempInput)
                    .screenshots({
                      timestamps: ['00:00:01'],
                      filename: path.basename(tempThumbnail),
                      folder: path.dirname(tempThumbnail),
                    })
                    .on('end', () => resolveThumb())
                    .on('error', () => resolveThumb());
                });

                cleanup([tempInput, tempOutput, tempThumbnail]);

                resolve({
                  buffer: outputBuffer,
                  contentType: 'video/mp4',
                  metadata: {
                    duration,
                    size: outputBuffer.length,
                    filetype: 'video/mp4',
                  },
                  fileName: path.basename(fileName, path.extname(fileName)) + '.mp4',
                });
              } catch (error) {
                logger.error('Error processing video output:', error);
                cleanup([tempInput, tempOutput, tempThumbnail]);
                resolve(null);
              }
            })
            .on('error', (err: Error) => {
              logger.error('FFmpeg error processing video:', err);
              cleanup([tempInput, tempOutput, tempThumbnail]);
              resolve(null);
            })
            .save(tempOutput);
        });
    } catch (error) {
      logger.error('Error processing video:', error);
      resolve(null);
    }
  });
}

async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        logger.error('Error getting audio duration:', err);
        resolve(0);
        return;
      }
      resolve(data.format.duration || 0);
    });
  });
}

function cleanup(files: string[]) {
  files.forEach((file) => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });
}

export async function processMedia(
  fileBuffer: Buffer,
  fileName: string,
  type: DonationType
): Promise<ProcessedMedia | null> {
  // Check file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    logger.error(`File size ${fileBuffer.length} exceeds limit ${MAX_FILE_SIZE}`);
    return null;
  }

  switch (type) {
    case 'image':
      return processImage(fileBuffer, fileName);
    case 'gif':
      return processGif(fileBuffer, fileName);
    case 'audio':
      return processAudio(fileBuffer, fileName);
    case 'video':
      return processVideo(fileBuffer, fileName);
    default:
      logger.error(`Unknown media type: ${type}`);
      return null;
  }
}

export async function uploadProcessedMedia(
  processed: ProcessedMedia,
  type: DonationType
): Promise<string | null> {
  const folderMap: Record<DonationType, 'gifs' | 'images' | 'audio' | 'video'> = {
    text: 'images', // Shouldn't happen, but fallback
    gif: 'gifs',
    image: 'images',
    audio: 'audio',
    video: 'video',
  };

  const folder = folderMap[type];
  const result = await uploadFile(processed.buffer, processed.fileName, processed.contentType, folder);

  return result?.url || null;
}

/**
 * Simple media processing function for direct URL/base64 handling
 * Used by donation route for quick media uploads
 */
export async function processMediaSimple(
  content: string,
  type: 'image' | 'gif' | 'audio' | 'video',
  wallet: string
): Promise<string> {
  try {
    logger.info(`[MEDIA] Processing ${type} for wallet: ${wallet}`);

    // If content is already a URL, return it
    if (content.startsWith('http://') || content.startsWith('https://')) {
      logger.info(`[MEDIA] Content is already a URL: ${content}`);
      return content;
    }

    // If content is base64, upload to Supabase Storage
    if (content.startsWith('data:')) {
      const base64Data = content.split(',')[1];
      const mimeType = content.split(';')[0].split(':')[1];
      const extension = mimeType.split('/')[1] || 'bin';

      // Generate unique filename
      const filename = `${wallet}_${Date.now()}.${extension}`;
      const folder = type === 'gif' ? 'gifs' : type === 'image' ? 'images' : type === 'audio' ? 'audio' : 'video';
      const filePath = `${folder}/${filename}`;

      logger.info(`[MEDIA] Uploading to Supabase Storage: ${filePath}`);

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('pushme-media')
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (error) {
        logger.error(`[MEDIA] Upload error:`, error);
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('pushme-media')
        .getPublicUrl(filePath);

      logger.info(`[MEDIA] Upload successful, URL: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    }

    // If content is already a string (shouldn't happen), return as-is
    logger.warn(`[MEDIA] Unexpected content format, returning as-is`);
    return content;
  } catch (error: any) {
    logger.error(`[MEDIA] Error processing media:`, error);
    throw error;
  }
}

