const CustomerSubscription = require('../models/CustomerSubscription');
const MealPlan = require('../models/MealPlan');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const { calculateProratedAmount } = require('../utils/proratedAmountUtils');

// @desc    Get all subscriptions with pagination
// @route   GET /api/subscriptions
// @access  Private
const getSubscriptions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const month = req.query.month;
    const year = req.query.year;
    const status = req.query.status;
    const building = req.query.building;
    const flat = req.query.flat;
    const search = req.query.search;

    // Build base query
    let query = {};
    if (month && year) {
      query['subscriptionPeriod.month'] = parseInt(month);
      query['subscriptionPeriod.year'] = parseInt(year);
    }
    if (status) {
      query.status = status;
    }

    // For building and flat filters, we need to use aggregation pipeline
    // to join with Customer collection and filter by delivery address
    let pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: '$customer' },
      {
        $lookup: {
          from: 'mealplans',
          localField: 'mealPlanId',
          foreignField: '_id',
          as: 'mealPlan'
        }
      },
      { $unwind: '$mealPlan' }
    ];

    // Add building and flat filters to pipeline
    let addressFilters = {};
    if (building) {
      addressFilters['customer.deliveryAddress.buildingName'] = building;
    }
    if (flat) {
      addressFilters['customer.deliveryAddress.flatNumber'] = flat;
    }
    if (search) {
      addressFilters.$or = [
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'mealPlan.planName': { $regex: search, $options: 'i' } },
        { 'customer.deliveryAddress.buildingName': { $regex: search, $options: 'i' } },
        { 'customer.deliveryAddress.flatNumber': { $regex: search, $options: 'i' } }
      ];
    }

    if (Object.keys(addressFilters).length > 0) {
      pipeline.push({ $match: addressFilters });
    }

    // Add sorting, pagination, and projection
    pipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          customerId: {
            _id: '$customer._id',
            name: '$customer.name',
            phone: '$customer.phone',
            email: '$customer.email',
            emirates: '$customer.emirates',
            deliveryAddress: '$customer.deliveryAddress'
          },
          mealPlanId: {
            _id: '$mealPlan._id',
            planName: '$mealPlan.planName',
            planCode: '$mealPlan.planCode',
            meals: '$mealPlan.meals',
            pricing: '$mealPlan.pricing'
          },
          subscriptionPeriod: 1,
          pricing: 1,
          customMeals: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          notes: 1,
          paymentStatus: 1,
          createdBy: 1,
          updatedBy: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    );

    const subscriptions = await CustomerSubscription.aggregate(pipeline);

    // Get total count for pagination
    let countPipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: '$customer' }
    ];

    if (Object.keys(addressFilters).length > 0) {
      countPipeline.push({ $match: addressFilters });
    }

    countPipeline.push({ $count: 'total' });
    const totalResult = await CustomerSubscription.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.status(200).json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalSubscriptions: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching subscriptions' 
    });
  }
};

// @desc    Get customer subscriptions
// @route   GET /api/subscriptions/customer/:customerId
// @access  Private
const getCustomerSubscriptions = async (req, res) => {
  try {
    const subscriptions = await CustomerSubscription.find({ 
      customerId: req.params.customerId 
    })
    .populate('mealPlanId', 'planName planCode meals pricing')
    .sort({ 'subscriptionPeriod.year': -1, 'subscriptionPeriod.month': -1 });

    res.status(200).json({
      success: true,
      data: { subscriptions }
    });
  } catch (error) {
    console.error('Get customer subscriptions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching customer subscriptions' 
    });
  }
};

// @desc    Create new subscription
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = async (req, res) => {
  try {
    const {
      customerId,
      mealPlanId,
      subscriptionPeriod,
      pricing,
      customMeals,
      startDate,
      endDate,
      notes,
      createdBy
    } = req.body;

    // Verify customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    // Verify meal plan exists
    const mealPlan = await MealPlan.findById(mealPlanId);
    if (!mealPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meal plan not found' 
      });
    }

    // Check for date overlaps with existing subscriptions
    // Two date ranges overlap if: start1 <= end2 AND start2 <= end1
    const overlappingSubscriptions = await CustomerSubscription.find({
      customerId,
      $and: [
        { startDate: { $lte: endDate } },     // Existing start <= new end
        { endDate: { $gte: startDate } }      // Existing end >= new start
      ]
    });

    if (overlappingSubscriptions.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer already has a subscription with overlapping dates. Please choose different dates.' 
      });
    }

    // Use meal plan base price if not provided
    if (!pricing.basePricePerMonth) {
      pricing.basePricePerMonth = mealPlan.pricing.basePrice;
    }

    // Calculate prorated final price based on subscription dates
    const proratedInfo = calculateProratedAmount(
      pricing.basePricePerMonth,
      startDate,
      endDate,
      pricing.discount
    );
    
    // Store both the base price and prorated final price
    pricing.finalPrice = proratedInfo.finalAmount;
    pricing.proratedAmount = proratedInfo.proratedAmount;
    pricing.subscriptionDays = proratedInfo.subscriptionDays;
    pricing.monthDays = proratedInfo.monthDays;
    pricing.proratedRatio = proratedInfo.proratedRatio;

    const subscription = await CustomerSubscription.create({
      customerId,
      mealPlanId,
      subscriptionPeriod,
      pricing,
      customMeals: customMeals || {},
      startDate,
      endDate,
      notes,
      createdBy: createdBy || req.user?.name || 'Admin'
    });

    // Populate the created subscription
    await subscription.populate('customerId', 'name phone email');
    await subscription.populate('mealPlanId', 'planName planCode meals');

    // Create corresponding payment record based on actual subscription period
    try {
      const dueDate = new Date(subscription.endDate);
      dueDate.setDate(dueDate.getDate() + 5); // Due 5 days after subscription ends
      
      // Calculate subscription duration for payment details
      const startDate = new Date(subscription.startDate);
      const endDate = new Date(subscription.endDate);
      const subscriptionDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      
      const paymentData = {
        customer: customerId,
        month: subscriptionPeriod.month,
        year: subscriptionPeriod.year,
        planDetails: {
          planName: mealPlan.planName,
          monthlyAmount: pricing.basePricePerMonth, // Store original base price
          proratedAmount: pricing.proratedAmount, // Store prorated amount before discount
          finalAmount: pricing.finalPrice, // Store final prorated discounted amount
          discountApplied: pricing.discount || { type: 'percentage', value: 0 },
          subscriptionPeriod: `${startDate.toDateString()} - ${endDate.toDateString()}`,
          subscriptionDays: pricing.subscriptionDays,
          monthDays: pricing.monthDays,
          proratedRatio: pricing.proratedRatio
        },
        amountDue: pricing.finalPrice, // Use prorated final price
        dueDate,
        paymentDate: subscription.startDate, // Set payment date to subscription start
        notes: `Payment for ${mealPlan.planName} subscription (${pricing.subscriptionDays} days out of ${pricing.monthDays}, ${Math.round(pricing.proratedRatio * 100)}%, ${startDate.toDateString()} to ${endDate.toDateString()})${pricing.discount?.value > 0 ? ` - ${pricing.discount.type === 'percentage' ? pricing.discount.value + '%' : pricing.discount.value + ' AED'} discount applied` : ''}`
      };
      
      // Only set recordedBy if we have a valid ObjectId
      if (createdBy || req.user?.id) {
        paymentData.recordedBy = createdBy || req.user.id;
      }
      
      await Payment.create(paymentData);
      
      console.log(`✅ Payment record created for subscription ${subscription._id}`);
    } catch (paymentError) {
      console.error('Error creating payment record:', paymentError);
      // Don't fail the subscription creation if payment creation fails
    }

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: { subscription }
    });

  } catch (error) {
    console.error('Create subscription error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Subscription already exists for this customer and period' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error creating subscription',
      error: error.message 
    });
  }
};

// @desc    Update subscription
// @route   PUT /api/subscriptions/:id
// @access  Private
const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription ID format' 
      });
    }

    // Get the subscription to check for payments
    const existingSubscription = await CustomerSubscription.findById(id);
    
    if (!existingSubscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }

    // Check for any payments for this customer/subscription
    const Payment = require('../models/Payment');
    
    // Get subscription period to check for payments
    const subscriptionStartDate = new Date(existingSubscription.startDate);
    const subscriptionEndDate = new Date(existingSubscription.endDate);
    
    // Check for payments in the subscription period
    const payments = await Payment.find({
      customer: existingSubscription.customerId,
      $or: [
        {
          year: { 
            $gte: subscriptionStartDate.getFullYear(),
            $lte: subscriptionEndDate.getFullYear()
          },
          month: {
            $gte: subscriptionStartDate.getMonth() + 1,
            $lte: subscriptionEndDate.getMonth() + 1
          }
        }
      ]
    });

    if (payments.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit subscription: Payment records exist for this subscription period. Please contact admin to modify payments first.'
      });
    }
    
    const updateData = {
      ...req.body,
      updatedBy: req.body.updatedBy || req.user?.name || 'Admin'
    };

    const subscription = await CustomerSubscription.findByIdAndUpdate(
      id, 
      updateData, 
      { 
        new: true, 
        runValidators: true 
      }
    )
    .populate('customerId', 'name phone email')
    .populate('mealPlanId', 'planName planCode meals');
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      data: { subscription }
    });

  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error updating subscription' 
    });
  }
};

// @desc    Cancel subscription
// @route   DELETE /api/subscriptions/:id
// @access  Private
const cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription ID format' 
      });
    }
    
    const subscription = await CustomerSubscription.findById(id);
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }

    subscription.status = 'cancelled';
    subscription.updatedBy = req.body.updatedBy || req.user?.name || 'Admin';
    await subscription.save();

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error cancelling subscription' 
    });
  }
};

// @desc    Get subscription pricing calculation
// @route   POST /api/subscriptions/calculate-pricing
// @access  Private
const calculateSubscriptionPricing = async (req, res) => {
  try {
    const { mealPlanId, discount } = req.body;

    const mealPlan = await MealPlan.findById(mealPlanId);
    if (!mealPlan) {
      return res.status(404).json({ 
        success: false, 
        message: 'Meal plan not found' 
      });
    }

    let finalPrice = mealPlan.pricing.basePrice;
    let discountAmount = 0;

    if (discount && discount.value > 0) {
      if (discount.type === 'percentage') {
        discountAmount = (finalPrice * discount.value) / 100;
        finalPrice = finalPrice - discountAmount;
      } else if (discount.type === 'fixed') {
        discountAmount = discount.value;
        finalPrice = Math.max(0, finalPrice - discountAmount);
      }
    }

    const pricingCalculation = {
      mealPlan: {
        id: mealPlan._id,
        name: mealPlan.planName,
        code: mealPlan.planCode
      },
      basePrice: mealPlan.pricing.basePrice,
      discount: discount || { type: 'percentage', value: 0 },
      discountAmount: discountAmount,
      finalPrice: finalPrice,
      currency: mealPlan.pricing.currency
    };

    res.status(200).json({
      success: true,
      data: { pricing: pricingCalculation }
    });

  } catch (error) {
    console.error('Calculate pricing error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error calculating pricing' 
    });
  }
};

// @desc    Get subscription statistics
// @route   GET /api/subscriptions/stats
// @access  Private
const getSubscriptionStats = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get total subscriptions (all time)
    const totalCount = await CustomerSubscription.countDocuments();
    
    // Get active subscriptions for CURRENT MONTH only
    const activeCount = await CustomerSubscription.countDocuments({ 
      status: 'active',
      'subscriptionPeriod.month': currentMonth,
      'subscriptionPeriod.year': currentYear
    });
    
    // Calculate monthly revenue from active subscriptions for CURRENT MONTH only
    const activeSubscriptions = await CustomerSubscription.find({ 
      status: 'active',
      'subscriptionPeriod.month': currentMonth,
      'subscriptionPeriod.year': currentYear
    }).populate('mealPlanId', 'pricing');
    
    let monthlyRevenue = 0;
    activeSubscriptions.forEach(subscription => {
      // Calculate prorated amount for each subscription
      if (subscription.startDate && subscription.endDate) {
        const proratedInfo = calculateProratedAmount(
          subscription.pricing.basePricePerMonth,
          subscription.startDate,
          subscription.endDate,
          subscription.pricing.discount
        );
        monthlyRevenue += proratedInfo.finalAmount;
      } else {
        // Fallback to existing finalPrice for subscriptions without date ranges
        monthlyRevenue += subscription.pricing.finalPrice || 0;
      }
    });

    // Get status breakdown
    const statusStats = await CustomerSubscription.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        activeCount,
        monthlyRevenue,
        statusStats
      }
    });

  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching subscription statistics' 
    });
  }
};

// @desc    Auto-extend active subscriptions to next month
// @route   POST /api/subscriptions/auto-extend
// @access  Private
const autoExtendSubscriptions = async (req, res) => {
  try {
    const { targetMonth, targetYear, createdBy } = req.body;
    
    // Use provided target month/year or default to current month
    const currentDate = new Date();
    const extendToMonth = targetMonth || (currentDate.getMonth() + 1); // Current month (1-indexed)
    const extendToYear = targetYear || currentDate.getFullYear();
    
    // Calculate previous month for source subscriptions
    const sourceMonth = extendToMonth === 1 ? 12 : extendToMonth - 1;
    const sourceYear = extendToMonth === 1 ? extendToYear - 1 : extendToYear;
    
    console.log(`🎯 Auto-extension: FROM ${sourceMonth}/${sourceYear} TO ${extendToMonth}/${extendToYear}`);
    
    // Find active subscriptions from previous month
    const allSubscriptions = await CustomerSubscription.find({
      status: 'active',
      'subscriptionPeriod.month': sourceMonth,
      'subscriptionPeriod.year': sourceYear
    })
    .populate('customerId', 'name phone email')
    .populate('mealPlanId', 'planName planCode meals pricing');
    
    // Get the last day of the source month
    const lastDayOfSourceMonth = new Date(sourceYear, sourceMonth, 0).getDate();
    
    // Filter to only include customers whose latest subscription ends on the last day of the month
    const eligibleSubscriptions = [];
    const customerGroups = {};
    
    // Group subscriptions by customer
    allSubscriptions.forEach(sub => {
      const customerId = sub.customerId._id.toString();
      if (!customerGroups[customerId]) {
        customerGroups[customerId] = [];
      }
      customerGroups[customerId].push(sub);
    });
    
    // Check each customer's subscriptions for eligibility
    for (const [customerId, customerSubs] of Object.entries(customerGroups)) {
      // Find the subscription with the latest end date for this customer
      let latestSubscription = customerSubs[0];
      let latestEndDate = new Date(latestSubscription.endDate);
      
      for (const sub of customerSubs) {
        const subEndDate = new Date(sub.endDate);
        if (subEndDate > latestEndDate) {
          latestSubscription = sub;
          latestEndDate = subEndDate;
        }
      }
      
      // Check if the latest subscription ends on the last day of the month
      const subscriptionEndDay = latestEndDate.getDate();
      
      if (subscriptionEndDay === lastDayOfSourceMonth) {
        // This customer is eligible for auto-extension
        eligibleSubscriptions.push(latestSubscription);
      }
    }
    
    console.log(`Found ${allSubscriptions.length} total active subscriptions from ${sourceMonth}/${sourceYear}`);
    console.log(`${eligibleSubscriptions.length} subscriptions are eligible for auto-extension (ending on last day of month: ${lastDayOfSourceMonth})`);
    
    const results = {
      extended: [],
      skipped: [],
      errors: []
    };
    
    // Get month boundaries for the target month
    const startDate = new Date(extendToYear, extendToMonth - 1, 1);
    const endDate = new Date(extendToYear, extendToMonth, 0);
    
    for (const subscription of eligibleSubscriptions) {
      try {
        // Check if same meal plan subscription already exists for target period
        const existingSubscription = await CustomerSubscription.findOne({
          customerId: subscription.customerId._id,
          mealPlanId: subscription.mealPlanId,
          'subscriptionPeriod.month': extendToMonth,
          'subscriptionPeriod.year': extendToYear
        });
        
        if (existingSubscription) {
          results.skipped.push({
            customerId: subscription.customerId._id,
            customerName: subscription.customerId.name,
            reason: 'Same meal plan subscription already exists for target period'
          });
          continue;
        }
        
        // Calculate prorated pricing for the new subscription
        const proratedInfo = calculateProratedAmount(
          subscription.pricing.basePricePerMonth,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          subscription.pricing.discount
        );

        // Create new subscription for next month
        const newSubscription = await CustomerSubscription.create({
          customerId: subscription.customerId._id,
          mealPlanId: subscription.mealPlanId._id,
          subscriptionPeriod: {
            month: extendToMonth,
            year: extendToYear
          },
          pricing: {
            basePricePerMonth: subscription.pricing.basePricePerMonth,
            discount: subscription.pricing.discount || { type: 'percentage', value: 0 },
            finalPrice: proratedInfo.finalAmount,
            proratedAmount: proratedInfo.proratedAmount,
            subscriptionDays: proratedInfo.subscriptionDays,
            monthDays: proratedInfo.monthDays,
            proratedRatio: proratedInfo.proratedRatio
          },
          customMeals: subscription.customMeals || {},
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          notes: subscription.notes || '',
          status: 'active',
          createdBy: createdBy || 'Auto-Extension System'
        });
        
        // Create corresponding payment record for the extended subscription
        try {
          const dueDate = new Date(endDate);
          dueDate.setDate(dueDate.getDate() + 5); // Due 5 days after subscription ends
          
          // Calculate subscription duration for payment details
          const subscriptionDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
          
          await Payment.create({
            customer: subscription.customerId._id,
            month: extendToMonth,
            year: extendToYear,
            planDetails: {
              planName: subscription.mealPlanId.planName,
              monthlyAmount: subscription.pricing.basePricePerMonth, // Original base price
              proratedAmount: proratedInfo.proratedAmount, // Prorated amount before discount 
              finalAmount: proratedInfo.finalAmount, // Final prorated discounted amount
              discountApplied: subscription.pricing.discount || { type: 'percentage', value: 0 },
              subscriptionPeriod: `${startDate.toDateString()} - ${endDate.toDateString()}`,
              subscriptionDays: proratedInfo.subscriptionDays,
              monthDays: proratedInfo.monthDays,
              proratedRatio: proratedInfo.proratedRatio
            },
            amountDue: proratedInfo.finalAmount, // Use prorated final price
            dueDate,
            paymentDate: startDate.toISOString().split('T')[0], // Set payment date to subscription start
            notes: `Auto-extended payment for ${subscription.mealPlanId.planName} (${proratedInfo.subscriptionDays} days out of ${proratedInfo.monthDays}, ${Math.round(proratedInfo.proratedRatio * 100)}%, ${startDate.toDateString()} to ${endDate.toDateString()})${subscription.pricing.discount?.value > 0 ? ` - ${subscription.pricing.discount.type === 'percentage' ? subscription.pricing.discount.value + '%' : subscription.pricing.discount.value + ' AED'} discount applied` : ''}`,
            // recordedBy omitted for auto-extension system
          });
          
          console.log(`✅ Payment record created for extended subscription ${newSubscription._id}`);
        } catch (paymentError) {
          console.error(`Error creating payment record for extended subscription:`, paymentError);
          // Don't fail the extension if payment creation fails
        }
        
        results.extended.push({
          customerId: subscription.customerId._id,
          customerName: subscription.customerId.name,
          subscriptionId: newSubscription._id,
          mealPlan: subscription.mealPlanId.planName,
          finalPrice: proratedInfo.finalAmount
        });
        
      } catch (error) {
        console.error(`Error extending subscription for customer ${subscription.customerId._id}:`, error);
        results.errors.push({
          customerId: subscription.customerId._id,
          customerName: subscription.customerId.name,
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Auto-extension completed. Extended: ${results.extended.length}, Skipped: ${results.skipped.length}, Errors: ${results.errors.length}`,
      data: {
        targetPeriod: { month: extendToMonth, year: extendToYear },
        sourcePeriod: { month: sourceMonth, year: sourceYear },
        results
      }
    });
    
  } catch (error) {
    console.error('Auto-extend subscriptions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during auto-extension',
      error: error.message 
    });
  }
};

// @desc    Get customers eligible for auto-extension
// @route   GET /api/subscriptions/auto-extend/eligible
// @access  Private
const getEligibleForAutoExtension = async (req, res) => {
  try {
    const { sourceMonth, sourceYear } = req.query;
    
    // Use previous month if not specified
    const currentDate = new Date();
    let dbMonth, dbYear;
    
    if (sourceMonth && sourceYear) {
      // Use provided parameters
      dbMonth = parseInt(sourceMonth);
      dbYear = parseInt(sourceYear);
    } else {
      // Calculate previous month (database uses 1-indexed months)
      const currentMonth = currentDate.getMonth() + 1; // Convert to 1-indexed
      if (currentMonth === 1) {
        // If current month is January, previous month is December of previous year
        dbMonth = 12;
        dbYear = currentDate.getFullYear() - 1;
      } else {
        dbMonth = currentMonth - 1;
        dbYear = currentDate.getFullYear();
      }
    }
    
    console.log(`🔍 Checking for eligible subscriptions from: ${dbMonth}/${dbYear}`);
    
    // Find active subscriptions from specified month
    const subscriptions = await CustomerSubscription.find({
      status: 'active',
      'subscriptionPeriod.month': dbMonth,
      'subscriptionPeriod.year': dbYear
    })
    .populate('customerId', 'name phone email emirates')
    .populate('mealPlanId', 'planName planCode meals pricing')
    .sort({ 'customerId.name': 1 });
    
    // Get the last day of the specified month
    const lastDayOfMonth = new Date(dbYear, dbMonth, 0).getDate();
    
    // Filter subscriptions: only include customers whose latest subscription ends on the last day of the month
    const eligibleSubscriptions = [];
    const customerGroups = {};
    
    // Group subscriptions by customer
    subscriptions.forEach(sub => {
      const customerId = sub.customerId._id.toString();
      if (!customerGroups[customerId]) {
        customerGroups[customerId] = [];
      }
      customerGroups[customerId].push(sub);
    });
    
    // Check each customer's subscriptions
    for (const [customerId, customerSubs] of Object.entries(customerGroups)) {
      // Find the subscription with the latest end date for this customer
      let latestSubscription = customerSubs[0];
      let latestEndDate = new Date(latestSubscription.endDate);
      
      for (const sub of customerSubs) {
        const subEndDate = new Date(sub.endDate);
        if (subEndDate > latestEndDate) {
          latestSubscription = sub;
          latestEndDate = subEndDate;
        }
      }
      
      // Check if the latest subscription ends on the last day of the month
      const subscriptionEndDay = latestEndDate.getDate();
      
      if (subscriptionEndDay === lastDayOfMonth) {
        // This customer is eligible for auto-extension
        eligibleSubscriptions.push(latestSubscription);
      }
    }
    
    const eligibleCustomers = eligibleSubscriptions.map(sub => ({
      subscriptionId: sub._id,
      customer: {
        id: sub.customerId._id,
        name: sub.customerId.name,
        phone: sub.customerId.phone,
        email: sub.customerId.email,
        emirates: sub.customerId.emirates
      },
      mealPlan: {
        id: sub.mealPlanId._id,
        name: sub.mealPlanId.planName,
        code: sub.mealPlanId.planCode
      },
      pricing: sub.pricing,
      period: sub.subscriptionPeriod,
      endDate: sub.endDate,
      eligibilityReason: `Subscription ends on last day of month (${lastDayOfMonth})`
    }));
    
    res.status(200).json({
      success: true,
      data: {
        sourcePeriod: { month: dbMonth, year: dbYear },
        eligibleCount: eligibleCustomers.length,
        customers: eligibleCustomers
      }
    });
    
  } catch (error) {
    console.error('Get eligible for auto-extension error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching eligible customers' 
    });
  }
};

// @desc    Generate payment records for existing subscriptions without payments
// @route   POST /api/subscriptions/generate-payments
// @access  Private (Admin)
const generatePaymentsForExistingSubscriptions = async (req, res) => {
  try {
    // Get all active subscriptions
    const subscriptions = await CustomerSubscription.find({ status: 'active' })
      .populate('customerId', 'name phone email')
      .populate('mealPlanId', 'planName planCode');
    
    console.log(`Found ${subscriptions.length} active subscriptions to process`);
    
    const results = {
      created: [],
      skipped: [],
      errors: []
    };
    
    for (const subscription of subscriptions) {
      try {
        // Check if payment already exists for this specific subscription
        // We need to check for payments that match the subscription period exactly
        const existingPayment = await Payment.findOne({
          customer: subscription.customerId._id,
          month: subscription.subscriptionPeriod.month,
          year: subscription.subscriptionPeriod.year,
          'planDetails.subscriptionPeriod': `${new Date(subscription.startDate).toDateString()} - ${new Date(subscription.endDate).toDateString()}`
        });
        
        if (existingPayment) {
          results.skipped.push({
            customerId: subscription.customerId._id,
            customerName: subscription.customerId.name,
            reason: 'Payment already exists'
          });
          continue;
        }
        
        // Create payment record based on actual subscription period
        const dueDate = new Date(subscription.endDate);
        dueDate.setDate(dueDate.getDate() + 5); // Due 5 days after subscription ends
        
        // Calculate prorated amount for the subscription
        const startDate = new Date(subscription.startDate);
        const endDate = new Date(subscription.endDate);
        const proratedInfo = calculateProratedAmount(
          subscription.pricing.basePricePerMonth,
          subscription.startDate,
          subscription.endDate,
          subscription.pricing.discount
        );
        
        const payment = await Payment.create({
          customer: subscription.customerId._id,
          month: subscription.subscriptionPeriod.month,
          year: subscription.subscriptionPeriod.year,
          planDetails: {
            planName: subscription.mealPlanId.planName,
            monthlyAmount: subscription.pricing.basePricePerMonth, // Original base price
            proratedAmount: proratedInfo.proratedAmount, // Prorated amount before discount
            finalAmount: proratedInfo.finalAmount, // Final prorated discounted amount
            discountApplied: subscription.pricing.discount || { type: 'percentage', value: 0 },
            subscriptionPeriod: `${startDate.toDateString()} - ${endDate.toDateString()}`,
            subscriptionDays: proratedInfo.subscriptionDays,
            monthDays: proratedInfo.monthDays,
            proratedRatio: proratedInfo.proratedRatio,
            subscriptionId: subscription._id // Add subscription reference
          },
          amountDue: proratedInfo.finalAmount, // Use prorated final price
          dueDate,
          paymentDate: subscription.startDate, // Set payment date to subscription start
          notes: `Generated payment for ${subscription.mealPlanId.planName} subscription (${proratedInfo.subscriptionDays} days out of ${proratedInfo.monthDays}, ${Math.round(proratedInfo.proratedRatio * 100)}%, ${startDate.toDateString()} to ${endDate.toDateString()})${subscription.pricing.discount?.value > 0 ? ` - ${subscription.pricing.discount.type === 'percentage' ? subscription.pricing.discount.value + '%' : subscription.pricing.discount.value + ' AED'} discount applied` : ''}`,
          // Only set recordedBy if we have a valid user ID
          ...(req.user?.id && { recordedBy: req.user.id })
        });
        
        results.created.push({
          customerId: subscription.customerId._id,
          customerName: subscription.customerId.name,
          paymentId: payment._id,
          amount: proratedInfo.finalAmount,
          subscriptionPeriod: `${startDate.toDateString()} - ${endDate.toDateString()}`
        });
        
      } catch (error) {
        console.error(`Error creating payment for subscription ${subscription._id}:`, error);
        results.errors.push({
          customerId: subscription.customerId._id,
          customerName: subscription.customerId.name,
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Payment generation completed. Created: ${results.created.length}, Skipped: ${results.skipped.length}, Errors: ${results.errors.length}`,
      data: results
    });
    
  } catch (error) {
    console.error('Generate payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error generating payments',
      error: error.message 
    });
  }
};

// @desc    Get weekly subscription report (3 days back to 3 days forward)
// @route   GET /api/subscriptions/reports/weekly
// @access  Private (Admin)
const getWeeklySubscriptionReport = async (req, res) => {
  try {
    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setDate(currentDate.getDate() - 3); // 3 days back
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(currentDate);
    endDate.setDate(currentDate.getDate() + 3); // 3 days forward
    endDate.setHours(23, 59, 59, 999);



    // Get newly activated subscriptions (startDate within range)
    // For testing, let's also try a wider date range if no results
    const wideStartDate = new Date(currentDate);
    wideStartDate.setDate(currentDate.getDate() - 30); // 30 days back
    const wideEndDate = new Date(currentDate);
    wideEndDate.setDate(currentDate.getDate() + 30); // 30 days forward

    const newlyActivatedPipeline = [
      {
        $match: {
          startDate: { $gte: startDate, $lte: endDate },
          status: { $in: ['active', 'paused'] }
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: '$customer' },
      {
        $lookup: {
          from: 'mealplans',
          localField: 'mealPlanId',
          foreignField: '_id',
          as: 'mealPlan'
        }
      },
      { $unwind: '$mealPlan' },
      {
        $project: {
          _id: 1,
          customerId: 1,
          customerName: '$customer.name',
          customerPhone: '$customer.fullPhoneNumber',
          deliveryAddress: {
            area: '$customer.deliveryAddress.area',
            buildingName: '$customer.deliveryAddress.buildingName',
            flatNumber: '$customer.deliveryAddress.flatNumber'
          },
          mealPlan: {
            name: '$mealPlan.name',
            breakfast: '$mealPlan.meals.breakfast',
            lunch: '$mealPlan.meals.lunch',
            dinner: '$mealPlan.meals.dinner'
          },
          customMeals: 1,
          startDate: 1,
          endDate: 1,
          status: 1,
          pricing: 1,
          subscriptionPeriod: 1,
          type: { $literal: 'activated' }
        }
      },
      { $sort: { startDate: 1 } }
    ];

    // Get expiring subscriptions (endDate within range)
    const expiringPipeline = [
      {
        $match: {
          endDate: { $gte: startDate, $lte: endDate },
          status: { $in: ['active', 'paused'] }
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: '$customer' },
      {
        $lookup: {
          from: 'mealplans',
          localField: 'mealPlanId',
          foreignField: '_id',
          as: 'mealPlan'
        }
      },
      { $unwind: '$mealPlan' },
      {
        $project: {
          _id: 1,
          customerId: 1,
          customerName: '$customer.name',
          customerPhone: '$customer.fullPhoneNumber',
          deliveryAddress: {
            area: '$customer.deliveryAddress.area',
            buildingName: '$customer.deliveryAddress.buildingName',
            flatNumber: '$customer.deliveryAddress.flatNumber'
          },
          mealPlan: {
            name: '$mealPlan.name',
            breakfast: '$mealPlan.meals.breakfast',
            lunch: '$mealPlan.meals.lunch',
            dinner: '$mealPlan.meals.dinner'
          },
          customMeals: 1,
          startDate: 1,
          endDate: 1,
          status: 1,
          pricing: 1,
          subscriptionPeriod: 1,
          type: { $literal: 'expiring' }
        }
      },
      { $sort: { endDate: 1 } }
    ];

    // Execute both pipelines
    const [newlyActivated, expiring] = await Promise.all([
      CustomerSubscription.aggregate(newlyActivatedPipeline),
      CustomerSubscription.aggregate(expiringPipeline)
    ]);

    // If no results in the 7-day window, try a wider range for demonstration
    let finalNewlyActivated = newlyActivated;
    let finalExpiring = expiring;
    
    if (newlyActivated.length === 0 && expiring.length === 0) {
      const wideNewlyActivatedPipeline = [...newlyActivatedPipeline];
      wideNewlyActivatedPipeline[0].$match.startDate = { $gte: wideStartDate, $lte: wideEndDate };
      
      const wideExpiringPipeline = [...expiringPipeline];
      wideExpiringPipeline[0].$match.endDate = { $gte: wideStartDate, $lte: wideEndDate };
      
      const [wideNewlyActivated, wideExpiring] = await Promise.all([
        CustomerSubscription.aggregate(wideNewlyActivatedPipeline),
        CustomerSubscription.aggregate(wideExpiringPipeline)
      ]);
      
      finalNewlyActivated = wideNewlyActivated;
      finalExpiring = wideExpiring;
    }

    // Calculate summary stats
    const stats = {
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0]
      },
      summary: {
        totalNewlyActivated: finalNewlyActivated.length,
        totalExpiring: finalExpiring.length,
        netChange: finalNewlyActivated.length - finalExpiring.length
      }
    };



    res.status(200).json({
      success: true,
      data: {
        stats,
        newlyActivated: finalNewlyActivated,
        expiring: finalExpiring
      }
    });

  } catch (error) {
    console.error('Weekly subscription report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching weekly subscription report',
      error: error.message 
    });
  }
};

// @desc    Check if subscription has payments in current month
// @route   GET /api/subscriptions/:id/check-payments
// @access  Private
const checkSubscriptionPayments = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription ID format' 
      });
    }

    // Get the subscription to find the customer
    const subscription = await CustomerSubscription.findById(id);
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }

    // Check for any payments related to this customer during subscription period
    const Payment = require('../models/Payment');
    
    // Get subscription period
    const subscriptionStartDate = new Date(subscription.startDate);
    const subscriptionEndDate = new Date(subscription.endDate);
    
    const payments = await Payment.find({
      customer: subscription.customerId,
      $or: [
        {
          year: { 
            $gte: subscriptionStartDate.getFullYear(),
            $lte: subscriptionEndDate.getFullYear()
          }
        }
      ]
    });

    // Set cache control headers to prevent 304 responses
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ETag': `"payment-check-${id}-${Date.now()}"` // Dynamic ETag to prevent caching
    });

    res.status(200).json({
      success: true,
      hasPayments: payments.length > 0,
      paymentCount: payments.length,
      subscriptionId: id,
      timestamp: new Date().toISOString(),
      data: { 
        hasPayments: payments.length > 0,
        message: payments.length > 0 ? 
          `${payments.length} payment record(s) exist for this subscription period` : 
          'No payments found for this subscription'
      }
    });

  } catch (error) {
    console.error('Check subscription payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error checking payments' 
    });
  }
};

// @desc    Delete subscription (permanently remove)
// @route   DELETE /api/subscriptions/:id
// @access  Private
const deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription ID format' 
      });
    }

    // Get the subscription to check for payments
    const subscription = await CustomerSubscription.findById(id);
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }

    // Check for any payments for this customer/subscription
    const Payment = require('../models/Payment');
    
    // Get subscription period to check for payments
    const subscriptionStartDate = new Date(subscription.startDate);
    const subscriptionEndDate = new Date(subscription.endDate);
    
    // Check for any payments related to this customer in the subscription period
    const payments = await Payment.find({
      customer: subscription.customerId,
      $or: [
        {
          year: { 
            $gte: subscriptionStartDate.getFullYear(),
            $lte: subscriptionEndDate.getFullYear()
          }
        }
      ]
    });

    if (payments.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete subscription: ${payments.length} payment record(s) exist for this customer during the subscription period. Please delete payments first.`
      });
    }

    // Safe to delete - no payments found
    await CustomerSubscription.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Subscription deleted successfully'
    });

  } catch (error) {
    console.error('Delete subscription error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting subscription' 
    });
  }
};

// @desc    Get delivery planning report for specific date and meal
// @route   GET /api/subscriptions/reports/delivery
// @access  Private
// @desc    Get available delivery time options for a meal type
// @route   GET /api/subscriptions/delivery-time-options
// @access  Private
const getDeliveryTimeOptions = async (req, res) => {
  try {
    const { mealType = 'lunch' } = req.query;

    // Define delivery time options for each meal type (same as dashboard breakdown)
    const deliveryTimeOptions = {
      breakfast: {
        'standard': { label: '🕐 Standard', displayTime: '7:00-9:00 AM' },
        'early-morning': { label: '🌅 Early Morning', displayTime: '5:00-6:00 AM' }
      },
      lunch: {
        'standard': { label: '🕐 Standard', displayTime: '11:00 AM-1:00 PM' },
        'early-morning': { label: '🌅 Early Morning', displayTime: '7:00-9:00 AM' },
        'late-afternoon': { label: '🌇 Late Afternoon', displayTime: '3:00-5:00 PM' }
      },
      dinner: {
        'standard': { label: '🕐 Standard', displayTime: '6:00-8:00 PM' },
        'late-night': { label: '🌙 Late Night', displayTime: '9:00-11:00 PM' }
      }
    };

    const options = deliveryTimeOptions[mealType.toLowerCase()] || deliveryTimeOptions.lunch;

    // Convert to array format for frontend
    const optionsArray = Object.entries(options).map(([key, value]) => ({
      value: key,
      label: value.label,
      displayTime: value.displayTime
    }));

    res.status(200).json({
      success: true,
      data: {
        mealType: mealType,
        options: optionsArray,
        defaultOption: 'standard'
      }
    });

  } catch (error) {
    console.error('Get delivery time options error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching delivery time options'
    });
  }
};

// @desc    Get delivery planning report
// @route   GET /api/subscriptions/delivery-report  
// @access  Private
const getDeliveryReport = async (req, res) => {
  try {
    const { 
      date, // Required: delivery date (YYYY-MM-DD)
      mealType = 'lunch', // Default to lunch
      deliveryTime = 'standard', // Default to standard delivery time
      customerId
    } = req.query;

    // Validate date parameter
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (YYYY-MM-DD format)'
      });
    }

    const selectedDate = new Date(date);
    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Build filter for active subscriptions that cover the selected date
    let subscriptionFilter = {
      status: 'active',
      startDate: { $lte: selectedDate },
      endDate: { $gte: selectedDate }
    };

    if (customerId) {
      subscriptionFilter.customerId = customerId;
    }

    // Get active subscriptions with customer and meal plan details
    const subscriptions = await CustomerSubscription.find(subscriptionFilter)
      .populate({
        path: 'customerId',
        select: 'name phone email deliveryAddress notes'
      })
      .populate({
        path: 'mealPlanId',
        select: 'planName meals pricing'
      });

    // Sort by building name first, then by customer name for easier delivery planning

    // Process subscription data for delivery planning
    let deliveryPlan = subscriptions.map(subscription => {
      const customer = subscription.customerId;
      const mealPlan = subscription.mealPlanId;
      
      // Handle missing customer or meal plan data
      if (!customer || !mealPlan) {
        return null;
      }

      // Check if the customer has the requested meal type enabled
      const mealTypeKey = mealType.toLowerCase();
      let hasMealEnabled = false;

      // Check custom meal settings first, then fallback to meal plan
      if (subscription.customMeals && subscription.customMeals[mealTypeKey] !== null) {
        hasMealEnabled = subscription.customMeals[mealTypeKey];
      } else if (mealPlan.meals && mealPlan.meals[mealTypeKey]) {
        const mealData = mealPlan.meals[mealTypeKey];
        hasMealEnabled = typeof mealData === 'boolean' ? mealData : mealData?.enabled || false;
      }

      // Skip if meal is not enabled for this customer
      if (!hasMealEnabled) {
        return null;
      }

      // Get delivery time for this meal type
      let customerDeliveryTime = 'standard';
      if (mealPlan.meals && mealPlan.meals[mealTypeKey] && typeof mealPlan.meals[mealTypeKey] === 'object') {
        customerDeliveryTime = mealPlan.meals[mealTypeKey].deliveryTime || 'standard';
      }

      // Default delivery times for each meal type (matching dashboard breakdown)
      const defaultDeliveryTimes = {
        breakfast: { 
          'standard': '7:00-9:00 AM', 
          'early-morning': '5:00-6:00 AM' 
        },
        lunch: { 
          'standard': '11:00 AM-1:00 PM', 
          'early-morning': '7:00-9:00 AM', 
          'late-afternoon': '3:00-5:00 PM' 
        },
        dinner: { 
          'standard': '6:00-8:00 PM', 
          'late-night': '9:00-11:00 PM' 
        }
      };

      const deliveryTimeDisplay = defaultDeliveryTimes[mealTypeKey]?.[customerDeliveryTime] || 
                                  defaultDeliveryTimes[mealTypeKey]?.standard || 
                                  'Standard Time';

      return {
        subscriptionId: subscription._id,
        customer: {
          id: customer._id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          buildingName: customer.deliveryAddress?.buildingName || 'N/A',
          flatNumber: customer.deliveryAddress?.flatNumber || 'N/A',
          area: customer.deliveryAddress?.area || 'N/A',
          notes: customer.notes || '',
          fullAddress: customer.deliveryAddress
        },
        mealPlan: {
          id: mealPlan._id,
          name: mealPlan.planName
        },
        deliveryDetails: {
          mealType: mealType,
          deliveryTime: customerDeliveryTime,
          deliveryTimeDisplay: deliveryTimeDisplay,
          date: selectedDate
        }
      };
    }).filter(item => item !== null); // Remove null entries

    // Sort by building name (ascending), then by customer name
    deliveryPlan.sort((a, b) => {
      const buildingA = (a.customer.buildingName === 'N/A' || !a.customer.buildingName) ? 'ZZZZ' : a.customer.buildingName;
      const buildingB = (b.customer.buildingName === 'N/A' || !b.customer.buildingName) ? 'ZZZZ' : b.customer.buildingName;
      
      if (buildingA !== buildingB) {
        return buildingA.localeCompare(buildingB);
      }
      
      // If same building, sort by customer name
      return a.customer.name.localeCompare(b.customer.name);
    });

    // Apply delivery time filter if specified
    if (deliveryTime && deliveryTime !== 'all') {
      deliveryPlan = deliveryPlan.filter(item => 
        item.deliveryDetails.deliveryTime === deliveryTime
      );
    }

    // Group by delivery time for summary
    const deliveryTimeSummary = deliveryPlan.reduce((acc, item) => {
      const timeSlot = item.deliveryDetails.deliveryTime;
      if (!acc[timeSlot]) {
        acc[timeSlot] = {
          timeSlot,
          displayTime: item.deliveryDetails.deliveryTimeDisplay,
          count: 0,
          customers: []
        };
      }
      acc[timeSlot].count++;
      acc[timeSlot].customers.push(item.customer.name);
      return acc;
    }, {});

    // Calculate summary
    const summary = {
      date: selectedDate.toISOString().split('T')[0],
      mealType: mealType,
      totalDeliveries: deliveryPlan.length,
      deliveryTimeBreakdown: Object.values(deliveryTimeSummary),
      areas: [...new Set(deliveryPlan.map(item => item.customer.area).filter(area => area !== 'N/A'))]
    };

    res.status(200).json({
      success: true,
      data: {
        deliveryPlan,
        summary,
        totalRecords: deliveryPlan.length
      }
    });

  } catch (error) {
    console.error('Get delivery planning error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error generating delivery plan' 
    });
  }
};

module.exports = {
  getSubscriptions,
  getCustomerSubscriptions,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  calculateSubscriptionPricing,
  getSubscriptionStats,
  autoExtendSubscriptions,
  getEligibleForAutoExtension,
  generatePaymentsForExistingSubscriptions,
  getWeeklySubscriptionReport,
  checkSubscriptionPayments,
  deleteSubscription,
  getDeliveryTimeOptions,
  getDeliveryReport
};