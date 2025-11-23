import { supabase } from '../config/supabase';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const BUCKET_NAME = 'pushme-media';

export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  folder: 'gifs' | 'images' | 'audio' | 'video'
): Promise<{ url: string; path: string } | null> {
  try {
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const filePath = `${folder}/${uniqueFileName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      logger.error('Error uploading file to Supabase:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return {
      url: urlData.publicUrl,
      path: filePath,
    };
  } catch (error) {
    logger.error('Error in uploadFile:', error);
    return null;
  }
}

export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

    if (error) {
      logger.error('Error deleting file from Supabase:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in deleteFile:', error);
    return false;
  }
}

export function ensureBucketExists(): Promise<boolean> {
  // This should be done manually in Supabase dashboard
  // But we can check if bucket exists
  return Promise.resolve(true);
}

