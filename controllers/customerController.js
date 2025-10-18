const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const MessPlan = require('../models/MessPlan');

// @desc    Get all customers with pagination and search
// @route   GET /api/customers
// @access  Private (Admin)
const getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const building = req.query.building || '';
    const flat = req.query.flat || '';
    const status = req.query.status || ''; // 'active', 'inactive'

    // Build query object
    let query = {};
    
    // Add search conditions
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { fullPhoneNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { emirates: { $regex: search, $options: 'i' } },
        { 'deliveryAddress.area': { $regex: search, $options: 'i' } },
        { 'deliveryAddress.buildingName': { $regex: search, $options: 'i' } },
        { 'deliveryAddress.flatNumber': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add building filter
    if (building) {
      query['deliveryAddress.buildingName'] = building;
    }
    
    // Add flat filter
    if (flat) {
      query['deliveryAddress.flatNumber'] = flat;
    }
    
    // Add status filter
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Customer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        customers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalCustomers: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching customers' 
    });
  }
};

// @desc    Get customer by ID with payment history
// @route   GET /api/customers/:id
// @access  Private (Admin)
const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    // Get recent payments
    const payments = await Payment.find({ customer: req.params.id })
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(12);

    res.status(200).json({
      success: true,
      data: { 
        customer,
        payments
      }
    });

  } catch (error) {
    console.error('Get customer by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching customer' 
    });
  }
};

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private (Admin)
const createCustomer = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      emirates,
      deliveryAddress,
      messPlans,
      joinDate,
      isActive,
      notes,
      updatedBy
    } = req.body;

    // Check if phone number already exists
    const existingPhone = await Customer.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this phone number already exists' 
      });
    }

    // Check if email already exists (only if email is provided)
    if (email && email.trim()) {
      const existingEmail = await Customer.findOne({ email: email.trim() });
      if (existingEmail) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer with this email already exists' 
        });
      }
    }

    const customer = await Customer.create({
      name,
      phone,
      email,
      emirates,
      deliveryAddress,
      messPlans,
      joinDate,
      isActive,
      notes,
      updatedBy
    });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: { customer }
    });

  } catch (error) {
    console.error('Create customer error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number already exists' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error creating customer',
      error: error.message 
    });
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private (Admin)
const updateCustomer = async (req, res) => {
  try {
    const { email, phone } = req.body;
    const customerId = req.params.id;

    // Check if phone number already exists (if phone is being updated)
    if (phone) {
      const existingPhone = await Customer.findOne({ 
        phone, 
        _id: { $ne: customerId } // Exclude current customer
      });
      if (existingPhone) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer with this phone number already exists' 
        });
      }
    }

    // Check if email already exists (if email is being updated and is not empty)
    if (email && email.trim()) {
      const existingEmail = await Customer.findOne({ 
        email: email.trim(),
        _id: { $ne: customerId } // Exclude current customer
      });
      if (existingEmail) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer with this email already exists' 
        });
      }
    }

    // Add updatedBy and updatedAt to the request body
    const updateData = {
      ...req.body,
      updatedBy: req.body.updatedBy || req.user?.name || 'System'
    };

    const customer = await Customer.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { 
        new: true, 
        runValidators: true 
      }
    );
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: { customer }
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error updating customer' 
    });
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private (Admin)
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    // Check if customer has active payments
    const activePayments = await Payment.find({ 
      customer: req.params.id,
      paymentStatus: { $in: ['pending', 'partial', 'overdue'] }
    });

    if (activePayments.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete customer with pending payments. Please settle all dues first.' 
      });
    }

    await Customer.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting customer' 
    });
  }
};

// @desc    Get customer dashboard stats
// @route   GET /api/customers/dashboard/stats
// @access  Private (Admin)
const getCustomerStats = async (req, res) => {
  try {
    const totalCustomers = await Customer.countDocuments();
    const activeCustomers = await Customer.countDocuments({ isActive: true });
    const inactiveCustomers = await Customer.countDocuments({ isActive: false });
    
    // Check if status field exists for suspended customers
    const suspendedCustomers = await Customer.countDocuments({ status: 'suspended' }).catch(() => 0);
    
    const newThisMonth = await Customer.countDocuments({
      createdAt: { 
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    });

    // Get area-wise distribution
    const areaStats = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$deliveryAddress.area', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        suspendedCustomers,
        newThisMonth,
        areaStats
      }
    });

  } catch (error) {
    console.error('Get customer stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching customer statistics' 
    });
  }
};

// @desc    Get building and flat filter options
// @route   GET /api/customers/filter-options
// @access  Private (Admin)
const getFilterOptions = async (req, res) => {
  try {
    // Get unique building names
    const buildings = await Customer.distinct('deliveryAddress.buildingName', {
      'deliveryAddress.buildingName': { $exists: true, $ne: '' }
    });
    
    // Get unique flats with their building association
    const flatsAggregation = await Customer.aggregate([
      {
        $match: {
          'deliveryAddress.buildingName': { $exists: true, $ne: '' },
          'deliveryAddress.flatNumber': { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: {
            building: '$deliveryAddress.buildingName',
            flat: '$deliveryAddress.flatNumber'
          }
        }
      },
      {
        $project: {
          _id: 0,
          building: '$_id.building',
          flat: '$_id.flat'
        }
      },
      {
        $sort: { building: 1, flat: 1 }
      }
    ]);
    
    // Get building-wise statistics
    const buildingStats = await Customer.aggregate([
      {
        $match: {
          'deliveryAddress.buildingName': { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$deliveryAddress.buildingName',
          totalCustomers: { $sum: 1 },
          activeCustomers: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          uniqueFlats: { $addToSet: '$deliveryAddress.flatNumber' }
        }
      },
      {
        $project: {
          building: '$_id',
          totalCustomers: 1,
          activeCustomers: 1,
          totalFlats: { $size: '$uniqueFlats' },
          _id: 0
        }
      },
      {
        $sort: { building: 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        buildings: buildings.sort(),
        flats: flatsAggregation,
        buildingStats
      }
    });

  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching filter options' 
    });
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
  getFilterOptions
};