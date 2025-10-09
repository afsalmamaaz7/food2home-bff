const mongoose = require('mongoose');
const MealPlan = require('../models/MealPlan');

const sampleMealPlans = [
  {
    planName: 'Basic Plan',
    planCode: 'BASIC',
    description: 'Essential meals for daily needs',
    meals: {
      breakfast: true,
      lunch: true,
      dinner: false
    },
    pricing: {
      basePrice: 150,
      currency: 'AED'
    },
    isActive: true
  },
  {
    planName: 'Premium Plan',
    planCode: 'PREMIUM',
    description: 'Complete meal solution for the whole day',
    meals: {
      breakfast: true,
      lunch: true,
      dinner: true
    },
    pricing: {
      basePrice: 250,
      currency: 'AED'
    },
    isActive: true
  },
  {
    planName: 'Lunch Only',
    planCode: 'LUNCH',
    description: 'Perfect for office workers',
    meals: {
      breakfast: false,
      lunch: true,
      dinner: false
    },
    pricing: {
      basePrice: 80,
      currency: 'AED'
    },
    isActive: true
  }
];

const seedMealPlans = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mess-management');
    console.log('Connected to MongoDB');

    // Clear existing meal plans
    await MealPlan.deleteMany({});
    console.log('Cleared existing meal plans');

    // Insert sample meal plans
    const createdPlans = await MealPlan.insertMany(sampleMealPlans);
    console.log(`Created ${createdPlans.length} meal plans:`);
    
    createdPlans.forEach(plan => {
      console.log(`- ${plan.planName} (${plan.planCode}): ${plan.pricing.basePrice} ${plan.pricing.currency}`);
    });

    mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error seeding meal plans:', error);
    process.exit(1);
  }
};

// Run the seeder if this file is executed directly
if (require.main === module) {
  seedMealPlans();
}

module.exports = seedMealPlans;