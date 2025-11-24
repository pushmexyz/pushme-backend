import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { broadcastOverlayEvent } from '../ws/overlaySocket';

const router = Router();

/**
 * POST /music/queue/add
 * Add a song to the music queue
 * Body: { wallet, username, songUrl, artist, title }
 */
router.post('/queue/add', async (req: Request, res: Response) => {
  try {
    const { wallet, username, songUrl, artist, title } = req.body;

    console.info('[MUSIC] Queue add request:', { wallet, title });

    // Validate required fields
    if (!wallet || !songUrl) {
      return res.status(400).json({
        success: false,
        error: 'wallet and songUrl are required',
      });
    }

    // Insert into music_queue table
    const { data: queueItem, error: insertError } = await supabase
      .from('music_queue')
      .insert({
        wallet: wallet,
        username: username || null,
        song_url: songUrl,
        artist: artist || null,
        title: title || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[MUSIC] Database error:', insertError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to add song to queue',
      });
    }

    console.info('[MUSIC] Song added to queue:', title);

    return res.json({
      success: true,
      queueItem: queueItem,
    });
  } catch (error: any) {
    console.error('[MUSIC] Error in /music/queue/add:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /music/queue/next
 * Get and remove the next song from the queue
 * Broadcasts "now_playing" event when song changes
 */
router.get('/queue/next', async (req: Request, res: Response) => {
  try {
    // Get the oldest song in queue (FIFO)
    const { data: nextSong, error: fetchError } = await supabase
      .from('music_queue')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('[MUSIC] Database error:', fetchError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch next song',
      });
    }

    if (!nextSong) {
      return res.json({
        success: true,
        song: null,
        message: 'Queue is empty',
      });
    }

    // Delete the song from queue
    const { error: deleteError } = await supabase
      .from('music_queue')
      .delete()
      .eq('id', nextSong.id);

    if (deleteError) {
      console.error('[MUSIC] Error removing song from queue:', deleteError.message);
      // Still return the song even if deletion fails
    }

    // Broadcast now_playing event
    broadcastOverlayEvent({
      type: 'now_playing',
      title: nextSong.title || 'Unknown',
      artist: nextSong.artist || 'Unknown',
      image: undefined, // Can be added later if needed
      timestamp: Date.now(),
    });

    console.info('[MUSIC] Now playing:', nextSong.title);
    console.info('[OVERLAY] Broadcasting now_playing event');

    return res.json({
      success: true,
      song: {
        id: nextSong.id,
        wallet: nextSong.wallet,
        username: nextSong.username,
        songUrl: nextSong.song_url,
        artist: nextSong.artist,
        title: nextSong.title,
      },
    });
  } catch (error: any) {
    console.error('[MUSIC] Error in /music/queue/next:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;

