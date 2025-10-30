import { GoogleGenAI, Type, Modality, InlineDataPart } from "@google/genai";
import { PlanStep } from '../types';

// Do not instantiate here, it's done in App.tsx to ensure API key is available
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const fileToGenerativePart = async (file: File): Promise<InlineDataPart> => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

const base64ToGenerativePart = (base64Data: string, mimeType: string = 'image/png'): InlineDataPart => {
    return {
        inlineData: {
            data: base64Data.split(',')[1],
            mimeType,
        }
    };
};

export const generateRestorationPlan = async (ai: GoogleGenAI, imageFile: File, userPrompt: string): Promise<PlanStep[]> => {
    const imagePart = await fileToGenerativePart(imageFile);
    const fullPrompt = `You are an expert photo restoration specialist. Analyze the provided image and the user's request: "${userPrompt}". 
    Create a dedicated, step-by-step plan to restore this photo to a full-color, high-quality image as if it was taken with a modern DSLR. 
    The plan should have between 2 and 4 distinct steps. For each step, define a clear goal.
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: [
            { text: fullPrompt },
            imagePart
        ]},
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        step: {
                            type: Type.INTEGER,
                            description: "The step number, starting from 1."
                        },
                        goal: {
                            type: Type.STRING,
                            description: "A clear, concise goal for this restoration step."
                        }
                    },
                    required: ["step", "goal"]
                }
            }
        }
    });

    try {
        const plan = JSON.parse(response.text);
        if (Array.isArray(plan) && plan.length > 0) {
            return plan;
        }
        throw new Error("Invalid plan format received from API.");
    } catch (e) {
        console.error("Failed to parse restoration plan:", e);
        throw new Error("Could not generate a valid restoration plan. The AI's response was not in the expected format.");
    }
};

export const generateStepPrompt = async (ai: GoogleGenAI, currentImageBase64: string, stepGoal: string, userPrompt: string): Promise<string> => {
    const imagePart = base64ToGenerativePart(currentImageBase64);
    const fullPrompt = `You are an expert prompt engineer for generative AI image models. Based on the provided image and the restoration goal: "${stepGoal}", create a concise but detailed prompt for the Gemini 2.5 Flash Image model. 
    The prompt must instruct the model to edit the image to achieve the goal while preserving the original composition, subject, and key features.
    If you see specific flaws like scratches, dust, or missing parts, include instructions to fix them.
    Where relevant, incorporate the user's original request: "${userPrompt}".
    The final output should be ONLY the prompt string, with no extra text or formatting.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: [
            { text: fullPrompt },
            imagePart
        ]}
    });

    return response.text.trim();
};

export const executeImageStep = async (ai: GoogleGenAI, currentImageBase64: string, stepPrompt: string): Promise<string> => {
    const imagePart = base64ToGenerativePart(currentImageBase64);
    const textPart = { text: stepPrompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [textPart, imagePart] },
        config: {
            responseModalities: [Modality.IMAGE],
        }
    });

    const firstPart = response.candidates?.[0]?.content?.parts[0];
    if (firstPart && 'inlineData' in firstPart) {
        const base64Data = firstPart.inlineData.data;
        return `data:image/png;base64,${base64Data}`;
    }

    throw new Error("Image generation failed or did not return an image.");
};
