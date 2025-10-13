const MealPlan = require('../models/MealPlan');

// @desc    Get all meal plans
// @route   GET /api/meal-plans
// @access  Private
const getMealPlans = async (req, res) => {
  try {
    const mealPlans = await MealPlan.find({ isActive: true })
      .sort({ 'pricing.basePrice': 1 });

    res.status(200).json({
      success: true,
      data: {
        mealPlans,
        count: mealPlans.length
      }
    });
  } catch (error) {
    console.error('Get meal plans error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching meal plans',
      error: error.message 
    });
  }
};

// @desc    Get single meal plan
// @route   GET /api/meal-plans/:id
// @access  Private
const getMealPlan = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid meal plan ID format' 
      });
    }
    
    const mealPlan = await MealPlan.findById(id);
    
    if (!mealPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meal plan not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: { mealPlan }
    });
  } catch (error) {
    console.error('Get meal plan error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching meal plan' 
    });
  }
};

// @desc    Create new meal plan
// @route   POST /api/meal-plans
// @access  Private (Admin)
const createMealPlan = async (req, res) => {
  try {
    const {
      planName,
      planCode,
      description,
      meals,
      pricing,
      createdBy
    } = req.body;

    // Check if plan code already exists
    const existingPlan = await MealPlan.findOne({ planCode: planCode.toUpperCase() });
    if (existingPlan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Meal plan with this code already exists' 
      });
    }

    const mealPlan = await MealPlan.create({
      planName,
      planCode: planCode.toUpperCase(),
      description,
      meals,
      pricing,
      createdBy: createdBy || req.user?.name || 'Admin'
    });

    res.status(201).json({
      success: true,
      message: 'Meal plan created successfully',
      data: { mealPlan }
    });

  } catch (error) {
    console.error('Create meal plan error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Meal plan code already exists' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error creating meal plan',
      error: error.message 
    });
  }
};

// @desc    Update meal plan
// @route   PUT /api/meal-plans/:id
// @access  Private (Admin)
const updateMealPlan = async (req, res) => {
  try {
    console.log('Updating meal plan:', req.params.id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Validate the meal plan ID format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid meal plan ID format' 
      });
    }

    // Validate delivery times if provided
    if (req.body.meals) {
      const validDeliveryTimes = ['standard', 'early-morning', 'late-afternoon', 'late-night'];
      
      for (const [mealType, mealData] of Object.entries(req.body.meals)) {
        if (typeof mealData === 'object' && mealData.deliveryTime) {
          if (!validDeliveryTimes.includes(mealData.deliveryTime)) {
            return res.status(400).json({
              success: false,
              message: `Invalid delivery time '${mealData.deliveryTime}' for ${mealType}. Valid options: ${validDeliveryTimes.join(', ')}`
            });
          }
        }
      }
    }

    const mealPlan = await MealPlan.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { 
        new: true, 
        runValidators: true 
      }
    );
    
    if (!mealPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meal plan not found' 
      });
    }

    console.log('Meal plan updated successfully:', mealPlan._id);

    res.status(200).json({
      success: true,
      message: 'Meal plan updated successfully',
      data: { mealPlan }
    });

  } catch (error) {
    console.error('Update meal plan error:', error);
    console.error('Error stack:', error.stack);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: messages
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field} already exists. Please choose a different value.`
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error updating meal plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete meal plan (soft delete)
// @route   DELETE /api/meal-plans/:id
// @access  Private (Admin)
const deleteMealPlan = async (req, res) => {
  try {
    const mealPlan = await MealPlan.findById(req.params.id);
    
    if (!mealPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meal plan not found' 
      });
    }

    // Soft delete by setting isActive to false
    mealPlan.isActive = false;
    await mealPlan.save();

    res.status(200).json({
      success: true,
      message: 'Meal plan deactivated successfully'
    });

  } catch (error) {
    console.error('Delete meal plan error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting meal plan' 
    });
  }
};

// @desc    Get meal plan pricing for calculation
// @route   GET /api/meal-plans/pricing/:planId
// @access  Private
const getMealPlanPricing = async (req, res) => {
  try {
    const mealPlan = await MealPlan.findById(req.params.planId);
    
    if (!mealPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meal plan not found' 
      });
    }

    const pricingInfo = {
      planId: mealPlan._id,
      planName: mealPlan.planName,
      planCode: mealPlan.planCode,
      basePrice: mealPlan.pricing.basePrice,
      currency: mealPlan.pricing.currency,
      meals: mealPlan.meals,
      mealCount: mealPlan.mealCount
    };

    res.status(200).json({
      success: true,
      data: { pricing: pricingInfo }
    });
  } catch (error) {
    console.error('Get meal plan pricing error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching pricing' 
    });
  }
};

// @desc    Get meal plan statistics
// @route   GET /api/meal-plans/stats
// @access  Private
const getMealPlanStats = async (req, res) => {
  try {
    const CustomerSubscription = require('../models/CustomerSubscription');
    
    // Get all active meal plans
    const activePlans = await MealPlan.find({ isActive: true })
      .sort({ 'pricing.basePrice': 1 });

    // Get subscriber counts for each plan
    const plansWithStats = await Promise.all(
      activePlans.map(async (plan) => {
        const subscribersCount = await CustomerSubscription.countDocuments({
          mealPlanId: plan._id,
          status: 'active'
        });

        return {
          _id: plan._id,
          planName: plan.planName,
          planCode: plan.planCode,
          meals: plan.meals,
          pricing: plan.pricing,
          subscribersCount
        };
      })
    );

    const totalPlans = await MealPlan.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        activePlans: plansWithStats,
        totalPlans
      }
    });

  } catch (error) {
    console.error('Get meal plan stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching meal plan statistics' 
    });
  }
};

module.exports = {
  getMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  getMealPlanPricing,
  getMealPlanStats
};