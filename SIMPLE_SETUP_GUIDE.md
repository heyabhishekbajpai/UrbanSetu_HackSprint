# Simple Setup Guide - Supabase Integration

## 🎯 What We're Doing

Right now, your app saves complaints to the browser (localStorage) - they disappear when you refresh. We're moving everything to Supabase (cloud database) so data is permanent and admins can see all complaints.

---

## 📋 PART 1: What to Do in Supabase Dashboard

### Step 1: Create Supabase Account & Project
1. Go to https://supabase.com
2. Sign up / Login
3. Click "New Project"
4. Fill in:
   - **Name**: UrbanSetu (or any name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
5. Wait 2-3 minutes for project to be created

### Step 2: Get Your API Keys
1. In your Supabase project, click **Settings** (gear icon) → **API**
2. Copy these two things:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

**Save these - you'll need them!**

### Step 3: Create the Database Table
1. In Supabase, click **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy and paste this entire SQL code:

```sql
-- Create complaints table
CREATE TABLE complaints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Complaint Details
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Department
  department VARCHAR(100) NOT NULL,
  
  -- Location
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  
  -- Image
  image_url TEXT,
  
  -- AI Data
  ai_prediction JSONB,
  ai_confidence DECIMAL(5, 4),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Admin
  admin_notes TEXT,
  assigned_to UUID REFERENCES auth.users(id)
);

-- Create indexes for faster searches
CREATE INDEX idx_complaints_user_id ON complaints(user_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_category ON complaints(category);
CREATE INDEX idx_complaints_created_at ON complaints(created_at DESC);

-- Enable security
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own complaints
CREATE POLICY "Users see own complaints"
  ON complaints FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own complaints
CREATE POLICY "Users create own complaints"
  ON complaints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can see all complaints
CREATE POLICY "Admins see all complaints"
  ON complaints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'userType' = 'admin'
    )
  );

-- Policy: Admins can update all complaints
CREATE POLICY "Admins update all complaints"
  ON complaints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'userType' = 'admin'
    )
  );
```

4. Click **Run** (or press Ctrl+Enter)
5. You should see "Success. No rows returned"

### Step 4: Create Storage Bucket for Images
1. Click **Storage** (left sidebar)
2. Click **New bucket**
3. Name: `complaint-images`
4. Check **Public bucket** ✅
5. Click **Create bucket**

### Step 5: Set Storage Permissions

**Option A: Using SQL Editor (Easier - Recommended)**

1. Click **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy and paste this entire code:

```sql
-- Allow public to view images
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'complaint-images');

-- Allow users to upload their own images
CREATE POLICY "Users upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'complaint-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

4. Click **Run** (or press Ctrl+Enter)
5. You should see "Success. No rows returned"

**Option B: Using Storage UI (Alternative)**

If you prefer using the UI:

1. Go to **Storage** → Click on `complaint-images` bucket
2. Click **Policies** tab
3. Click **New Policy**
4. Select **For full customization**
5. For **Policy name**: Enter `Public Access`
6. For **Allowed operation**: Select `SELECT`
7. For **Policy definition**: Paste ONLY this part (without CREATE POLICY):

```sql
bucket_id = 'complaint-images'
```

8. Click **Review** → **Save policy**

9. Create second policy:
   - **Policy name**: `Users upload images`
   - **Allowed operation**: Select `INSERT`
   - **Policy definition**: Paste this:

```sql
bucket_id = 'complaint-images' AND auth.uid()::text = (storage.foldername(name))[1]
```

10. Click **Review** → **Save policy**

---

## 💻 PART 2: What to Change in Your Code

### Step 1: Install Supabase Package

Open terminal in your project folder and run:
```bash
npm install @supabase/supabase-js
```

### Step 2: Create Environment File

1. In your project root, create a file named `.env`
2. Add these lines (replace with YOUR values from Supabase):

```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important**: Don't commit `.env` to git (it's already in `.gitignore`)

### Step 3: Create Supabase Config File

Create new file: `src/config/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

### Step 4: Create Service File for Database Operations

Create new file: `src/services/complaintService.js`

```javascript
import { supabase } from '../config/supabase';

// Upload image to Supabase Storage
export const uploadImage = async (imageFile, userId) => {
  const fileExt = imageFile.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('complaint-images')
    .upload(fileName, imageFile);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('complaint-images')
    .getPublicUrl(fileName);

  return publicUrl;
};

// Submit complaint to database
export const submitComplaint = async (complaintData) => {
  const { data, error } = await supabase
    .from('complaints')
    .insert([complaintData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Get user's complaints
export const getUserComplaints = async (userId) => {
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

// Get all complaints (for admin)
export const getAllComplaints = async () => {
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

// Update complaint status (for admin)
export const updateComplaintStatus = async (complaintId, updates) => {
  const { data, error } = await supabase
    .from('complaints')
    .update(updates)
    .eq('id', complaintId)
    .select()
    .single();

  if (error) throw error;
  return data;
};
```

### Step 5: Update ReportComplaint.js

In `src/components/citizen/ReportComplaint.js`:

**Find the `onSubmit` function** (around line 536) and **replace it** with:

```javascript
import { uploadImage, submitComplaint } from '../../services/complaintService';
import toast from 'react-hot-toast';

const onSubmit = async (data) => {
  try {
    setIsProcessing(true);
    
    // 1. Upload image
    let imageUrl = null;
    if (capturedImage) {
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], 'complaint.jpg', { type: 'image/jpeg' });
      imageUrl = await uploadImage(file, user.id);
    }

    // 2. Prepare data
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
        confidence: aiPrediction.probability
      } : null,
      ai_confidence: aiPrediction?.probability || null,
      status: 'pending'
    };

    // 3. Save to database
    await submitComplaint(complaintData);
    
    toast.success('Complaint submitted successfully!');
    navigate('/citizen');
  } catch (error) {
    console.error('Error:', error);
    toast.error('Failed to submit complaint');
  } finally {
    setIsProcessing(false);
  }
};
```

### Step 6: Update CitizenDashboard.js

In `src/components/citizen/CitizenDashboard.js`:

**Find the `useEffect` that loads complaints** (around line 45) and **replace** with:

```javascript
import { getUserComplaints, getComplaintStats } from '../../services/complaintService';

useEffect(() => {
  const loadComplaints = async () => {
    try {
      const complaints = await getUserComplaints(user.id);
      setRecentComplaints(complaints);
      
      // Calculate stats
      const stats = {
        total: complaints.length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        pending: complaints.filter(c => c.status === 'pending').length,
        inProgress: complaints.filter(c => c.status === 'in_progress').length
      };
      setStats(stats);
    } catch (error) {
      console.error('Error loading complaints:', error);
      toast.error('Failed to load complaints');
    }
  };

  if (user) {
    loadComplaints();
  }
}, [user]);
```

### Step 7: Update AdminDashboard.js

In `src/components/admin/AdminDashboard.js`:

**Find where complaints are loaded** and **replace** with:

```javascript
import { getAllComplaints, updateComplaintStatus } from '../../services/complaintService';

useEffect(() => {
  const loadComplaints = async () => {
    try {
      const complaints = await getAllComplaints();
      setComplaints(complaints);
      
      // Update stats
      const stats = {
        total: complaints.length,
        pending: complaints.filter(c => c.status === 'pending').length,
        inProgress: complaints.filter(c => c.status === 'in_progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        today: complaints.filter(c => {
          const today = new Date().toDateString();
          return new Date(c.created_at).toDateString() === today;
        }).length
      };
      setStats(stats);
    } catch (error) {
      console.error('Error loading complaints:', error);
      toast.error('Failed to load complaints');
    }
  };

  loadComplaints();
}, [selectedFilter, searchQuery]);
```

---

## ✅ Summary Checklist

### In Supabase:
- [ ] Create project
- [ ] Copy API URL and key
- [ ] Run SQL to create `complaints` table
- [ ] Create `complaint-images` storage bucket
- [ ] Set storage policies

### In Your Code:
- [ ] Run `npm install @supabase/supabase-js`
- [ ] Create `.env` file with Supabase credentials
- [ ] Create `src/config/supabase.js`
- [ ] Create `src/services/complaintService.js`
- [ ] Update `ReportComplaint.js` onSubmit function
- [ ] Update `CitizenDashboard.js` to load from database
- [ ] Update `AdminDashboard.js` to load from database

---

## 🧪 Test It

1. Start your app: `npm start`
2. Submit a complaint (with image)
3. Check Supabase Dashboard → **Table Editor** → `complaints` table
4. You should see your complaint there!
5. Check **Storage** → `complaint-images` → you should see the image

---

## 🆘 Common Issues

**"Missing Supabase environment variables"**
- Make sure `.env` file exists in project root
- Restart your dev server after creating `.env`

**"Failed to submit complaint"**
- Check browser console for error
- Make sure you ran the SQL in Supabase
- Check that RLS policies are created

**"Image upload failed"**
- Make sure storage bucket `complaint-images` exists
- Check storage policies are set

---

That's it! Your app will now save everything to Supabase instead of browser storage. 🎉

