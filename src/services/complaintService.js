import { supabase } from '../config/supabase';

/**
 * Upload image to Supabase Storage
 */
export const uploadImage = async (imageFile, userId) => {
  try {
    const fileExt = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    console.log('Uploading image to bucket: complaint-images');
    console.log('File name:', fileName);
    
    const { data, error } = await supabase.storage
      .from('complaint-images')
      .upload(fileName, imageFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Storage upload error:', error);
      // Check if bucket doesn't exist
      if (error.message?.includes('Bucket not found') || error.message?.includes('not found')) {
        throw new Error('Storage bucket "complaint-images" not found. Please create it in Supabase Dashboard → Storage.');
      }
      throw error;
    }

    console.log('Upload successful, data:', data);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('complaint-images')
      .getPublicUrl(fileName);

    console.log('Public URL:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

/**
 * Submit complaint to database
 */
export const submitComplaint = async (complaintData) => {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .insert([complaintData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error submitting complaint:', error);
    throw error;
  }
};

/**
 * Get user's complaints
 */
export const getUserComplaints = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user complaints:', error);
    throw error;
  }
};

/**
 * Get all complaints (for admin)
 */
export const getAllComplaints = async (filters = {}) => {
  try {
    let query = supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.department) {
      query = query.eq('department', filters.department);
    }
    if (filters.search) {
      query = query.or(`description.ilike.%${filters.search}%,address.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching complaints:', error);
    throw error;
  }
};

/**
 * Update complaint status (for admin)
 */
export const updateComplaintStatus = async (complaintId, updates) => {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    if (updates.status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', complaintId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating complaint:', error);
    throw error;
  }
};

/**
 * Get complaint statistics
 */
export const getComplaintStats = async (userId = null) => {
  try {
    let query = supabase.from('complaints');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.select('status, category');

    if (error) throw error;

    const stats = {
      total: data.length,
      pending: data.filter(c => c.status === 'pending').length,
      inProgress: data.filter(c => c.status === 'in_progress').length,
      resolved: data.filter(c => c.status === 'resolved').length,
      byCategory: {}
    };

    // Count by category
    data.forEach(complaint => {
      stats.byCategory[complaint.category] = 
        (stats.byCategory[complaint.category] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
};

