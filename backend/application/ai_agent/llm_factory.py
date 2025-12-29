from typing import Optional
from langchain_core.language_models.chat_models import BaseChatModel
from backend.core.config import settings

class LLMFactory:
    @staticmethod
    def create_llm(provider: str = None, model: str = None, temperature: float = 0.0) -> BaseChatModel:
        provider = provider or settings.DEFAULT_LLM_PROVIDER
        model = model or settings.DEFAULT_LLM_MODEL
        
        if provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=model,
                temperature=temperature,
                api_key=settings.OPENAI_API_KEY
            )
        
        elif provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=model,
                temperature=temperature,
                api_key=settings.ANTHROPIC_API_KEY
            )
        
        elif provider == "groq":
            from langchain_groq import ChatGroq
            return ChatGroq(
                model=model, # e.g. llama3-70b-8192
                temperature=temperature,
                api_key=settings.GROQ_API_KEY
            )
            
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
