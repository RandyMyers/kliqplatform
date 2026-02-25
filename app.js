const express = require('express');
const http = require('http');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv'); 


const fileUpload = require('express-fileupload');
const receiverEvent = require('./helper/receiverEvent');
//const currencyEvent = require('./helper/exchangeRateEvent')

// Import Swagger configuration
const { specs, swaggerUi } = require('./swagger');

// Importing route files
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const contactRoutes = require('./routes/contactRoutes');
const storeRoutes = require('./routes/storeRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const taskRoutes = require('./routes/taskRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const billingRoutes = require('./routes/billingRoutes');
const supportRoutes = require('./routes/supportRoutes');
const couponRoutes = require('./routes/couponRoutes');
const extensionsRoutes = require('./routes/extensionsRoutes');
const conversationsRoutes = require('./routes/conversationsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const blogRoutes = require('./routes/blogRoutes');
const sitemapRoutes = require('./routes/sitemapRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const marketingRoutes = require('./routes/marketingRoutes');
const healthRoutes = require('./routes/healthRoutes');
const { errorHandler } = require('./middleware/errorHandler');

dotenv.config();

const cloudinary = require('cloudinary').v2;
const app = express();

// Cloudinary Configuration
const cloudinaryConfig = require('./config/cloudinary');

// Set Cloudinary configuration as a local variable
app.use((req, res, next) => {
  cloudinary.config(cloudinaryConfig);
  next();
});

mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB', error);
  });

// Middleware
console.log('About to set up middleware');
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://kliqcrm.com',
      'http://kliqcrm.com',
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('🚫 CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  credentials: false,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  preflightContinue: false
}));

// Additional CORS middleware for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:8800',
    'http://localhost:3000',
    'http://localhost:3001',
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.header('Access-Control-Allow-Credentials', 'false');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Webhooks must receive raw body for signature verification (before bodyParser)
app.use('/api/webhooks', webhookRoutes);

app.use(bodyParser.json({ limit: '10mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true })); 
app.use(morgan('dev')); 

app.use(
  fileUpload({
    useTempFiles: true, // Store files in memory instead of a temporary directory
    createParentPath: true, // Create the 'uploads' directory if not exists
    tempFileDir: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }
  })
); 

// Serve local uploads for hybrid attachment system
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));






// Rate limiting: auth and contact (before routes)
const { authLimiter, contactLimiter } = require('./middleware/rateLimit');
app.use('/api/auth', authLimiter);
app.use('/api/contact', contactLimiter);

// Health check (no auth)
app.use('/api/health', healthRoutes);

// Using imported routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/extensions', extensionsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api', sitemapRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/marketing', marketingRoutes);

//Start the cron job for receiver emails
receiverEvent.scheduleEmailSync();

// Initialize Exchange Rate Sync Service
const rateSyncService = require('./services/rateSyncService');
rateSyncService.initialize()
  .then(() => {
    console.log('✅ Exchange Rate Sync Service initialized');
  })
  .catch((error) => {
    console.error('❌ Failed to initialize Exchange Rate Sync Service:', error);
  });

// Start the server
const PORT = process.env.PORT || 8800;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
});

// Remove the global error handler - let each controller handle its own errors
// app.use(errorHandler);
