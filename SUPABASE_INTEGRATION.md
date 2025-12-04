# Supabase Integration Guide - UrbanSetu

## 📋 Overview

This guide outlines the complete integration of Supabase as the backend for UrbanSetu, replacing the current localStorage/mock data implementation.

## 🗄️ Database Schema

### 1. **complaints** Table

```sql
-- Create complaints table
CREATE TABLE complaints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Complaint Details
  category VARCHAR(50) NOT NULL, -- Pothole, Garbage, Sewage, StreetLight, FallenTree
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, in_progress, resolved, rejected
  
  -- Department Assignment
  department VARCHAR(100) NOT NULL, -- Auto-assigned based on category
  
  -- Location Data
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  
  -- Image Storage
  image_url TEXT, -- URL from Supabase Storage
  
  -- AI Prediction Data
  ai_prediction JSONB, -- Store AI confidence scores and predictions
  ai_confidence DECIMAL(5, 4), -- Confidence score (0-1)
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Admin Notes
  admin_notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) -- Admin user assigned
);

-- Create indexes for better query performance
CREATE INDEX idx_complaints_user_id ON complaints(user_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_category ON complaints(category);
CREATE INDEX idx_complaints_department ON complaints(department);
CREATE INDEX idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX idx_complaints_location ON complaints USING GIST (point(longitude, latitude));

-- Enable Row Level Security (RLS)
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Citizens can view their own complaints
CREATE POLICY "Citizens can view own complaints"
  ON complaints FOR SELECT
  USING (auth.uid() = user_id);

-- Citizens can insert their own complaints
CREATE POLICY "Citizens can insert own complaints"
  ON complaints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all complaints
CREATE POLICY "Admins can view all complaints"
  ON complaints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'userType' = 'admin'
    )
  );

-- Admins can update all complaints
CREATE POLICY "Admins can update all complaints"
  ON complaints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'userType' = 'admin'
    )
  );

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2. **users** Table (Extend auth.users)

```sql
-- Add custom fields to auth.users metadata
-- This is done via Supabase Dashboard or API
-- Fields to add in user_metadata:
-- - userType: 'citizen' or 'admin'
-- - name: Full name
-- - phone: Phone number (optional)
-- - avatar: Avatar URL (optional)
```

### 3. **Storage Bucket for Images**

```sql
-- Create storage bucket for complaint images
INSERT INTO storage.buckets (id, name, public)
VALUES ('complaint-images', 'complaint-images', true);

-- Storage Policies

-- Anyone can view images (public bucket)
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'complaint-images');

-- Authenticated users can upload their own images
CREATE POLICY "Users can upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'complaint-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own images
CREATE POLICY "Users can update own images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'complaint-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own images
CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'complaint-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## 📦 Installation Steps

### Step 1: Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Step 2: Create Supabase Configuration File

Create `src/config/supabase.js`:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Step 3: Create Environment Variables

Create `.env` file in project root:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Add to `.gitignore`:
```
.env
.env.local
```

## 🔧 Code Implementation

### 1. Update AuthContext to use Supabase

Replace `src/contexts/AuthContext.js` with Supabase authentication.

### 2. Create Complaint Service

Create `src/services/complaintService.js`:

```javascript
import { supabase } from '../config/supabase';

/**
 * Upload image to Supabase Storage
 */
export const uploadComplaintImage = async (imageFile, userId) => {
  try {
    const fileExt = imageFile.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('complaint-images')
      .upload(fileName, imageFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('complaint-images')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

/**
 * Submit a new complaint
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
 * Get all complaints for a user (Citizen)
 */
export const getUserComplaints = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching user complaints:', error);
    throw error;
  }
};

/**
 * Get all complaints (Admin)
 */
export const getAllComplaints = async (filters = {}) => {
  try {
    let query = supabase
      .from('complaints')
      .select('*, users:user_id(name, email)')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.status) {
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
    return data;
  } catch (error) {
    console.error('Error fetching complaints:', error);
    throw error;
  }
};

/**
 * Update complaint status (Admin)
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

/**
 * Subscribe to real-time complaint updates
 */
export const subscribeToComplaints = (callback, filters = {}) => {
  let query = supabase
    .channel('complaints-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'complaints',
        filter: filters.status ? `status=eq.${filters.status}` : undefined
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(query);
  };
};
```

### 3. Update ReportComplaint Component

Update `src/components/citizen/ReportComplaint.js`:

```javascript
import { uploadComplaintImage, submitComplaint } from '../../services/complaintService';
import toast from 'react-hot-toast';

// In onSubmit function, replace the mock implementation:
const onSubmit = async (data) => {
  try {
    setIsProcessing(true);
    
    // 1. Upload image to Supabase Storage
    let imageUrl = null;
    if (capturedImage) {
      // Convert base64 to File object
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], 'complaint-image.jpg', { type: 'image/jpeg' });
      
      imageUrl = await uploadComplaintImage(file, user.id);
    }

    // 2. Prepare complaint data
    const complaintData = {
      user_id: user.id,
      category: data.category,
      description: data.description,
      priority: data.priority,
      department: data.department || DEPARTMENT_MAPPING[data.category],
      address: data.address || currentAddress,
      latitude: parseFloat(data.latitude || currentLocation?.lat),
      longitude: parseFloat(data.longitude || currentLocation?.lng),
      image_url: imageUrl,
      ai_prediction: aiPrediction ? {
        predictedClass: aiPrediction.className,
        confidence: aiPrediction.probability,
        allPredictions: aiPrediction.allPredictions
      } : null,
      ai_confidence: aiPrediction?.probability || null,
      status: 'pending'
    };

    // 3. Submit to Supabase
    const submittedComplaint = await submitComplaint(complaintData);
    
    toast.success('Complaint submitted successfully!');
    navigate('/citizen');
  } catch (error) {
    console.error('Error submitting complaint:', error);
    toast.error('Failed to submit complaint. Please try again.');
  } finally {
    setIsProcessing(false);
  }
};
```

### 4. Update CitizenDashboard Component

Update `src/components/citizen/CitizenDashboard.js`:

```javascript
import { getUserComplaints, getComplaintStats } from '../../services/complaintService';
import { useEffect } from 'react';

// Replace mock data with real Supabase calls
useEffect(() => {
  const fetchComplaints = async () => {
    try {
      const [complaints, stats] = await Promise.all([
        getUserComplaints(user.id),
        getComplaintStats(user.id)
      ]);
      
      setRecentComplaints(complaints);
      setStats(stats);
    } catch (error) {
      console.error('Error fetching complaints:', error);
      toast.error('Failed to load complaints');
    }
  };

  if (user) {
    fetchComplaints();
  }
}, [user]);
```

### 5. Update AdminDashboard Component

Update `src/components/admin/AdminDashboard.js`:

```javascript
import { getAllComplaints, updateComplaintStatus, subscribeToComplaints } from '../../services/complaintService';

// Replace mock data with real Supabase calls
useEffect(() => {
  const fetchComplaints = async () => {
    try {
      const complaints = await getAllComplaints({
        status: selectedFilter !== 'all' ? selectedFilter : undefined,
        search: searchQuery
      });
      
      setComplaints(complaints);
      
      // Update stats
      const stats = {
        total: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        inProgress: complaints.filter(c => c.status === 'in_progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        today: complaints.filter(c => {
          const today = new Date();
          const created = new Date(c.created_at);
          return created.toDateString() === today.toDateString();
        }).length
      };
      setStats(stats);
    } catch (error) {
      console.error('Error fetching complaints:', error);
      toast.error('Failed to load complaints');
    }
  };

  fetchComplaints();

  // Subscribe to real-time updates
  const unsubscribe = subscribeToComplaints((payload) => {
    console.log('Complaint updated:', payload);
    fetchComplaints(); // Refresh list
  }, { status: selectedFilter !== 'all' ? selectedFilter : undefined });

  return () => unsubscribe();
}, [selectedFilter, searchQuery]);
```

## 🔐 Authentication Integration

Update `src/contexts/AuthContext.js` to use Supabase Auth:

```javascript
import { supabase } from '../config/supabase';

export const AuthProvider = ({ children }) => {
  // ... existing state ...

  const login = async (email, password, userType) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Get user metadata
      const user = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || email.split('@')[0],
        userType: data.user.user_metadata?.userType || userType,
        avatar: data.user.user_metadata?.avatar
      };

      setUser(user);
      return { success: true, user };
    } catch (error) {
      toast.error(error.message || 'Login failed');
      return { success: false, error: error.message };
    }
  };

  const register = async (userData) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            name: userData.name,
            userType: userData.userType,
            phone: userData.phone
          }
        }
      });

      if (error) throw error;

      const user = {
        id: data.user.id,
        email: data.user.email,
        name: userData.name,
        userType: userData.userType
      };

      setUser(user);
      return { success: true, user };
    } catch (error) {
      toast.error(error.message || 'Registration failed');
      return { success: false, error: error.message };
    }
  };

  // ... rest of the implementation
};
```

## 📝 Implementation Checklist

- [ ] Create Supabase project
- [ ] Run database schema SQL in Supabase SQL Editor
- [ ] Create storage bucket for images
- [ ] Set up RLS policies
- [ ] Install @supabase/supabase-js
- [ ] Create supabase config file
- [ ] Add environment variables
- [ ] Create complaintService.js
- [ ] Update AuthContext.js
- [ ] Update ReportComplaint.js
- [ ] Update CitizenDashboard.js
- [ ] Update AdminDashboard.js
- [ ] Test complaint submission
- [ ] Test admin dashboard
- [ ] Test real-time updates

## 🚀 Next Steps

1. **Set up Supabase Project**: Go to supabase.com and create a new project
2. **Run SQL Schema**: Copy the SQL from Step 1 and run it in Supabase SQL Editor
3. **Create Storage Bucket**: Use Supabase Dashboard or SQL to create the bucket
4. **Get API Keys**: Copy your project URL and anon key from Settings > API
5. **Install Dependencies**: Run `npm install @supabase/supabase-js`
6. **Implement Code**: Follow the code examples above
7. **Test**: Test the complete flow from complaint submission to admin viewing

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

