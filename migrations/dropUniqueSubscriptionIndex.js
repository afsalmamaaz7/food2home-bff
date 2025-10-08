/**
 * Database migration to remove unique constraints that prevent multiple subscriptions/payments per month
 * This allows customers to have multiple subscription periods within the same month (e.g., 1-10 and 15-20)
 * and corresponding multiple payment records
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function dropUniqueIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // ===============================
    // 1. CUSTOMER SUBSCRIPTIONS
    // ===============================
    console.log('\n📋 Processing CustomerSubscriptions collection...');
    const subscriptionsCollection = db.collection('customersubscriptions');

    // List existing indexes to see what we're working with
    console.log('Current subscription indexes:');
    const subscriptionIndexes = await subscriptionsCollection.indexes();
    subscriptionIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });

    // Drop the problematic unique subscription index
    const subscriptionIndexNames = [
      'customerId_1_mealPlanId_1_subscriptionPeriod.month_1_subscriptionPeriod.year_1',
      'customerId_1_subscriptionPeriod.month_1_subscriptionPeriod.year_1_mealPlanId_1',
      'unique_customer_meal_period'
    ];

    for (const indexName of subscriptionIndexNames) {
      try {
        await subscriptionsCollection.dropIndex(indexName);
        console.log(`✅ Successfully dropped subscription index: ${indexName}`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`ℹ️  Subscription index ${indexName} not found or already dropped`);
        } else {
          console.error(`❌ Error dropping subscription index ${indexName}:`, error.message);
        }
      }
    }

    // ===============================
    // 2. PAYMENTS  
    // ===============================
    console.log('\n💳 Processing Payments collection...');
    const paymentsCollection = db.collection('payments');

    // List existing payment indexes
    console.log('Current payment indexes:');
    const paymentIndexes = await paymentsCollection.indexes();
    paymentIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });

    // Drop the problematic unique payment index
    const paymentIndexNames = [
      'customer_1_month_1_year_1'
    ];

    for (const indexName of paymentIndexNames) {
      try {
        await paymentsCollection.dropIndex(indexName);
        console.log(`✅ Successfully dropped payment index: ${indexName}`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`ℹ️  Payment index ${indexName} not found or already dropped`);
        } else {
          console.error(`❌ Error dropping payment index ${indexName}:`, error.message);
        }
      }
    }

    // List indexes after cleanup
    console.log('\n📊 Final Results:');
    console.log('\nSubscription indexes after cleanup:');
    const finalSubscriptionIndexes = await subscriptionsCollection.indexes();
    finalSubscriptionIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });

    console.log('\nPayment indexes after cleanup:');
    const finalPaymentIndexes = await paymentsCollection.indexes();
    finalPaymentIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('You can now create:');
    console.log('- Multiple subscriptions per month for the same customer and meal plan');
    console.log('- Multiple payments per month for the same customer');
    console.log('- Separate payments for each subscription period (e.g., 1-10 and 15-20)');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
dropUniqueIndexes();