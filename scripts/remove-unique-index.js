/**
 * Script to remove the unique index that prevents multiple subscriptions per customer per month
 * Run this script to update the database after model changes
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function removeUniqueIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mess-management');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('customersubscriptions');

    // Get current indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));

    // Find and drop the unique index
    const uniqueIndexName = indexes.find(idx => 
      idx.key.customerId === 1 && 
      idx.key.mealPlanId === 1 && 
      idx.key['subscriptionPeriod.month'] === 1 && 
      idx.key['subscriptionPeriod.year'] === 1
    )?.name;

    if (uniqueIndexName) {
      await collection.dropIndex(uniqueIndexName);
      console.log(`Dropped unique index: ${uniqueIndexName}`);
    } else {
      console.log('Unique index not found or already removed');
    }

    // Create the new non-unique index
    await collection.createIndex({ 
      customerId: 1, 
      'subscriptionPeriod.month': 1, 
      'subscriptionPeriod.year': 1 
    });
    console.log('Created new non-unique index');

    console.log('Index migration completed successfully');
  } catch (error) {
    console.error('Error during index migration:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the migration
removeUniqueIndex();