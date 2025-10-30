import React, { useState, useCallback, useMemo, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AppStatus, RestorationStep, PlanStep } from './types';
import { generateRestorationPlan, generateStepPrompt, executeImageStep } from './services/geminiService';
import { UploadIcon, SparklesIcon, ArrowRightIcon } from './components/icons';

interface StepCardProps {
  step: RestorationStep;
  isLast: boolean;
}

const StepCard: React.FC<StepCardProps> = ({ step, isLast }) => (
  <div className={`bg-gray-800/50 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-500 ease-in-out ${isLast ? 'shadow-lg shadow-purple-500/10' : ''}`}>
    <div className="p-4 bg-gray-900/50">
      <h3 className="text-lg font-bold text-purple-400">Step {step.step}: <span className="text-gray-200 font-medium">{step.goal}</span></h3>
    </div>
    <div className="p-4">
      <p className="text-sm text-gray-400 mb-3 font-mono bg-gray-900 p-3 rounded-md">
        <span className="text-cyan-400">Prompt:</span> "{step.prompt}"
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div className="text-center">
          <h4 className="text-sm font-semibold mb-2 text-gray-300">Before</h4>
          <img src={step.beforeImage} alt={`Before step ${step.step}`} className="rounded-lg w-full object-contain" />
        </div>
        <div className="hidden md:flex justify-center items-center">
          <ArrowRightIcon className="w-10 h-10 text-purple-400" />
        </div>
        <div className="md:hidden text-center text-gray-500 text-xs">▼ AFTER ▼</div>
        <div className="text-center">
          <h4 className="text-sm font-semibold mb-2 text-gray-300">After</h4>
          <img src={step.afterImage} alt={`After step ${step.step}`} className="rounded-lg w-full object-contain" />
        </div>
      </div>
    </div>
  </div>
);


const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [restorationSteps, setRestorationSteps] = useState<RestorationStep[]>([]);
  const [progressMessage, setProgressMessage] = useState<string>('');

  const aiRef = useRef<GoogleGenAI | null>(null);

  const getAiClient = useCallback(() => {
    if (!aiRef.current) {
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable not set");
        }
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return aiRef.current;
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      resetState();
    }
  };
  
  const resetState = () => {
    setStatus('idle');
    setError(null);
    setRestorationSteps([]);
    setProgressMessage('');
  };
  
  const handleStartOver = () => {
    setImageFile(null);
    setImagePreview(null);
    setUserPrompt('');
    resetState();
  };

  const handleRestore = useCallback(async () => {
    if (!imageFile) return;
    
    resetState();
    setStatus('planning');
    setProgressMessage('Generating restoration plan...');

    try {
      const ai = getAiClient();
      const plan = await generateRestorationPlan(ai, imageFile, userPrompt);
      
      setStatus('restoring');
      let currentImageBase64 = imagePreview!;
      const totalSteps = plan.length;
      const completedSteps: RestorationStep[] = [];

      for (const [index, planStep] of plan.entries()) {
        setProgressMessage(`Step ${index + 1}/${totalSteps}: Generating prompt for "${planStep.goal}"...`);
        const stepPrompt = await generateStepPrompt(ai, currentImageBase64, planStep.goal, userPrompt);
        
        setProgressMessage(`Step ${index + 1}/${totalSteps}: Applying AI restoration for "${planStep.goal}"...`);
        const newImageBase64 = await executeImageStep(ai, currentImageBase64, stepPrompt);

        const newStep: RestorationStep = {
            ...planStep,
            prompt: stepPrompt,
            beforeImage: currentImageBase64,
            afterImage: newImageBase64,
        };
        
        completedSteps.push(newStep);
        setRestorationSteps([...completedSteps]);
        
        currentImageBase64 = newImageBase64;
      }

      setStatus('done');
      setProgressMessage('Restoration complete!');
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'An unknown error occurred during the restoration process.');
      setStatus('error');
    }
  }, [imageFile, userPrompt, imagePreview, getAiClient]);

  const isProcessing = useMemo(() => status === 'planning' || status === 'restoring', [status]);

  const dropzoneBg = useMemo(() => {
    return imagePreview ? `url(${imagePreview})` : 'none';
  }, [imagePreview]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 text-transparent bg-clip-text">
            AI Photo Restoration Cascade
          </h1>
          <p className="text-gray-400 mt-2 max-w-2xl mx-auto">
            Upload an old photo, provide instructions, and watch a chain of AI models bring it back to life.
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="lg:sticky top-8 self-start flex flex-col gap-6">
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
              <label htmlFor="file-upload" className="cursor-pointer">
                <div
                  className="relative border-2 border-dashed border-gray-600 rounded-lg h-64 flex flex-col justify-center items-center text-center p-4 transition-all duration-300 hover:border-purple-500 hover:bg-gray-700/50 bg-cover bg-center"
                  style={{ backgroundImage: dropzoneBg }}
                >
                  <div className={`absolute inset-0 bg-black transition-opacity duration-300 ${imagePreview ? 'bg-opacity-70 hover:bg-opacity-60' : 'bg-opacity-20'}`}></div>
                  <div className="relative z-10 flex flex-col items-center">
                    <UploadIcon className="w-12 h-12 text-gray-400 mb-2" />
                    <span className="text-lg font-semibold text-gray-200">{imageFile ? 'Click to change image' : 'Drag & drop or click to upload'}</span>
                    <span className="text-sm text-gray-400">PNG, JPG, WEBP</span>
                  </div>
                </div>
              </label>
              <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} disabled={isProcessing} />
            </div>

            <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                <label htmlFor="user-prompt" className="block text-lg font-medium text-gray-200 mb-2">Optional Instructions</label>
                <textarea
                    id="user-prompt"
                    rows={3}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md p-3 text-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    placeholder="e.g., The woman has blonde hair and blue eyes..."
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    disabled={isProcessing}
                ></textarea>
            </div>

            {status === 'idle' && imageFile && (
                <button
                    onClick={handleRestore}
                    disabled={isProcessing || !imageFile}
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                    <SparklesIcon />
                    Restore Photo
                </button>
            )}

            {(status === 'done' || status === 'error') && (
                <button
                    onClick={handleStartOver}
                    className="w-full flex items-center justify-center gap-2 bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-cyan-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                    Start Over
                </button>
            )}

          </div>

          <div className="flex flex-col gap-6">
            {isProcessing && (
              <div className="bg-gray-800 p-6 rounded-xl shadow-lg flex items-center gap-4">
                  <div className="w-10 h-10 border-4 border-t-purple-500 border-gray-600 rounded-full animate-spin"></div>
                  <div>
                    <p className="text-lg font-semibold text-gray-200">Processing...</p>
                    <p className="text-sm text-gray-400">{progressMessage}</p>
                  </div>
              </div>
            )}

            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-xl">
                  <p className="font-bold">An Error Occurred</p>
                  <p className="text-sm mt-1">{error}</p>
              </div>
            )}
            
            {restorationSteps.map((step, index) => (
                <StepCard key={step.step} step={step} isLast={index === restorationSteps.length - 1} />
            ))}
            
            {!isProcessing && restorationSteps.length === 0 && !error && (
                <div className="bg-gray-800 p-10 rounded-xl shadow-lg text-center text-gray-400">
                    <p className="text-lg">Your restoration process will appear here.</p>
                </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
