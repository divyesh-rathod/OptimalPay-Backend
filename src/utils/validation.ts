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

