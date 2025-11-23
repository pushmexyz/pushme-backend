import { supabase, Donation } from '../config/supabase';
import { logger } from '../utils/logger';
import { ProcessedDonation } from '../types/DonationTypes';
import { v4 as uuidv4 } from 'uuid';

export async function createDonation(donation: ProcessedDonation): Promise<Donation | null> {
  try {
    const { data, error } = await supabase
      .from('donations')
      .insert({
        id: uuidv4(),
        wallet: donation.wallet,
        username: donation.username,
        type: donation.type,
        media_url: donation.mediaUrl,
        text: donation.text,
        price: donation.price,
        tx_hash: donation.txHash,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating donation:', error);
      return null;
    }

    logger.info(`Donation created: ${data.id} from ${donation.wallet}`);
    return data as Donation;
  } catch (error) {
    logger.error('Error in createDonation:', error);
    return null;
  }
}

export async function getUserDonations(wallet: string, limit: number = 10): Promise<Donation[]> {
  try {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .eq('wallet', wallet)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching donations:', error);
      return [];
    }

    return (data || []) as Donation[];
  } catch (error) {
    logger.error('Error in getUserDonations:', error);
    return [];
  }
}

export async function getRecentDonations(limit: number = 50): Promise<Donation[]> {
  try {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching recent donations:', error);
      return [];
    }

    return (data || []) as Donation[];
  } catch (error) {
    logger.error('Error in getRecentDonations:', error);
    return [];
  }
}

