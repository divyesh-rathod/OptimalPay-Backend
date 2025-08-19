import joi from 'joi';

// Validation schema for user registration
export const userSignupSchema = joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(8).required(),
    name: joi.string().required()
    
});

export const userLoginSchema = joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(8).required()
});

export const financialDataSchema = joi.object({
    monthly_income: joi.number().min(0).required(),
    monthly_expenses: joi.number().min(0).required()
});




// Debt validation schema for CREATE
export const createDebtSchema = joi.object({
    name: joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Debt name is required',
            'string.max': 'Debt name must be less than 100 characters'
        }),
    
    type: joi.string()
        .valid(
            'CREDIT_CARD',
            'MORTGAGE', 
            'OTHER',
            'AUTO_LOAN',
            'STUDENT_LOAN',
            'MEDICAL_DEBT',
            'PERSONAL_LOAN'
        )
        .required()
        .messages({
            'any.only': 'Debt type must be one of: CREDIT_CARD, MORTGAGE, OTHER, AUTO_LOAN, STUDENT_LOAN, MEDICAL_DEBT, PERSONAL_LOAN'
        }),
    
    originalAmount: joi.number()
        .positive()
        .max(10000000) // 10 million max
        .precision(2)  // 2 decimal places
        .required()
        .messages({
            'number.positive': 'Original amount must be greater than 0',
            'number.max': 'Original amount cannot exceed $10,000,000'
        }),
    
    currentAmount: joi.number()
        .min(0)
        .max(joi.ref('originalAmount')) // Cannot exceed original amount
        .precision(2)
        .required()
        .messages({
            'number.min': 'Current amount cannot be negative',
            'number.max': 'Current amount cannot exceed original amount'
        }),
    
    interestRate: joi.number()
        .min(0)
        .max(0.50) // 50% maximum interest rate
        .precision(4) // 4 decimal places (0.2499 for 24.99%)
        .required()
        .messages({
            'number.min': 'Interest rate cannot be negative',
            'number.max': 'Interest rate cannot exceed 50% (0.50)',
            'number.base': 'Interest rate must be a decimal (e.g., 0.24 for 24%)'
        }),
    
    minimumPayment: joi.number()
        .positive()
        .max(100000) // $100k max monthly payment
        .precision(2)
        .required()
        .messages({
            'number.positive': 'Minimum payment must be greater than 0',
            'number.max': 'Minimum payment cannot exceed $100,000'
        }),
    
    notes: joi.string()
        .trim()
        .max(500)
        .optional()
        .allow('')
        .messages({
            'string.max': 'Notes must be less than 500 characters'
        }),
    
    tenure: joi.number()
        .integer()
        .min(1)
        .max(600) // 50 years max
        .optional()
        .messages({
            'number.integer': 'Tenure must be a whole number of months',
            'number.min': 'Tenure must be at least 1 month',
            'number.max': 'Tenure cannot exceed 600 months (50 years)'
        }),
    
    remainingTenure: joi.number()
        .integer()
        .min(0)
        .max(joi.ref('tenure')) // Cannot exceed total tenure
        .optional()
        .messages({
            'number.integer': 'Remaining tenure must be a whole number of months',
            'number.min': 'Remaining tenure cannot be negative',
            'number.max': 'Remaining tenure cannot exceed total tenure'
        })
}).messages({
    'object.unknown': 'Unknown field "{#label}" is not allowed'
});

// Update validation schema for debt updates
export const updateDebtSchema = joi.object({
    name: joi.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),
    
    interestRate: joi.number()
        .min(0)
        .max(0.50)
        .precision(4)
        .optional(),
    
     type: joi.string()
        .valid(
            'CREDIT_CARD',
            'MORTGAGE', 
            'OTHER',
            'AUTO_LOAN',
            'STUDENT_LOAN',
            'MEDICAL_DEBT',
            'PERSONAL_LOAN'
        )
        .required()
        .messages({
            'any.only': 'Debt type must be one of: CREDIT_CARD, MORTGAGE, OTHER, AUTO_LOAN, STUDENT_LOAN, MEDICAL_DEBT, PERSONAL_LOAN'
        }),
    
    originalAmount: joi.number()
        .positive()
        .max(100000000) // 100 million max
        .precision(2)  // 2 decimal places
        .required()
        .messages({
            'number.positive': 'Original amount must be greater than 0',
            'number.max': 'Original amount cannot exceed $10,000,000'
        }),
    
    currentAmount: joi.number()
        .min(0)
        .max(joi.ref('originalAmount')) // Cannot exceed original amount
        .precision(2)
        .required()
        .messages({
            'number.min': 'Current amount cannot be negative',
            'number.max': 'Current amount cannot exceed original amount'
        }),
    
    minimumPayment: joi.number()
        .positive()
        .max(100000)
        .precision(2)
        .optional(),
    
    notes: joi.string()
        .trim()
        .max(500)
        .optional()
        .allow(''),
    
    remainingTenure: joi.number()
        .integer()
        .min(0)
        .max(600)
        .optional()
}).min(1) // At least one field must be provided for update
.messages({
    'object.min': 'At least one field must be provided for update'
});


export const uuidParamSchema = joi.object({
    id: joi.string()
        .uuid({ version: ['uuidv4'] })
        .required()
        .messages({
            'string.guid': 'Invalid ID format. Must be a valid UUID.',
            'any.required': 'ID is required'
        })
});

// Payment validation schemas
export const makePaymentSchema = joi.object({
    debtId: joi.string()
        .uuid({ version: ['uuidv4'] })
        .required()
        .messages({
            'string.guid': 'Invalid debt ID format. Must be a valid UUID.',
            'any.required': 'Debt ID is required'
        }),
    
    paymentAmount: joi.number()
        .positive()
        .max(1000000) // $1 million max payment
        .precision(2) // 2 decimal places
        .required()
        .messages({
            'number.positive': 'Payment amount must be greater than 0',
            'number.max': 'Payment amount cannot exceed $1,000,000',
            'any.required': 'Payment amount is required'
        }),
    
    notes: joi.string()
        .trim()
        .max(500)
        .optional()
        .allow('', null)
        .messages({
            'string.max': 'Notes must be less than 500 characters'
        })
});

export const debtIdParamSchema = joi.object({
    debtId: joi.string()
        .uuid({ version: ['uuidv4'] })
        .required()
        .messages({
            'string.guid': 'Invalid debt ID format. Must be a valid UUID.',
            'any.required': 'Debt ID is required'
        })
});

export const paymentHistoryQuerySchema = joi.object({
    limit: joi.number()
        .integer()
        .min(1)
        .max(1000)
        .optional()
        .messages({
            'number.integer': 'Limit must be a whole number',
            'number.min': 'Limit must be at least 1',
            'number.max': 'Limit cannot exceed 1000'
        })
});
